import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { BookingService } from './booking.service';
import { BookingCalendarService } from './booking-calendar.service';

const GROUP = 'soporte@fractalops.com.mx';

describe('BookingService', () => {
  let service: BookingService;
  const freebusyQuery = jest.fn();
  const eventsInsert = jest.fn();

  const mockCalendarClient = {
    getClient: jest.fn(),
    calendarId: 'primary',
    availabilityGroupEmail: null as string | null,
  };

  /** Atajo: el caso normal es un solo calendario destino sin nada ocupado. */
  const freeDay = () => ({ data: { calendars: { primary: { busy: [] } } } });

  const bookingDto = {
    eventTypeId: 'soporte' as const,
    startTime: '2026-01-06T15:00:00.000Z',
    attendeeName: 'Jane Doe',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCalendarClient.calendarId = 'primary';
    mockCalendarClient.availabilityGroupEmail = null;
    mockCalendarClient.getClient.mockResolvedValue({
      freebusy: { query: freebusyQuery },
      events: { insert: eventsInsert },
    });
    eventsInsert.mockResolvedValue({
      data: {
        id: 'evt-1',
        hangoutLink: 'https://meet.google.com/abc-defg-hij',
        htmlLink: 'https://calendar.google.com/event?eid=abc',
      },
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingService,
        { provide: BookingCalendarService, useValue: mockCalendarClient },
      ],
    }).compile();

    service = module.get<BookingService>(BookingService);

    // Lunes 2026-01-05 12:00 UTC. México no observa horario de verano desde 2022, así que
    // Ciudad de México es UTC-6 todo el año: 09:00 local del martes 6 == 15:00 UTC.
    jest.useFakeTimers().setSystemTime(new Date('2026-01-05T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getAvailability', () => {
    it('returns 9 hourly slots for a full free business day (9am-6pm, 60min event)', async () => {
      freebusyQuery.mockResolvedValue(freeDay());

      const slots = await service.getAvailability('soporte', '2026-01-06');

      expect(slots).toHaveLength(9);
      expect(slots[0]).toBe('2026-01-06T15:00:00.000Z');
      expect(slots[slots.length - 1]).toBe('2026-01-06T23:00:00.000Z');
    });

    it('excludes slots that overlap a busy period', async () => {
      freebusyQuery.mockResolvedValue({
        data: {
          calendars: {
            primary: { busy: [{ start: '2026-01-06T15:00:00.000Z', end: '2026-01-06T16:00:00.000Z' }] },
          },
        },
      });

      const slots = await service.getAvailability('soporte', '2026-01-06');

      expect(slots).toHaveLength(8);
      expect(slots).not.toContain('2026-01-06T15:00:00.000Z');
    });

    it('returns no slots on weekends', async () => {
      // 2026-01-04 es domingo.
      const slots = await service.getAvailability('soporte', '2026-01-04');

      expect(slots).toEqual([]);
      expect(freebusyQuery).not.toHaveBeenCalled();
    });

    it('throws for an unknown event type', async () => {
      await expect(service.getAvailability('unknown', '2026-01-06')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('queries free/busy on the configured non-primary calendar, not "primary"', async () => {
      mockCalendarClient.calendarId = 'equipo.ventas@group.calendar.google.com';
      freebusyQuery.mockResolvedValue({
        data: {
          calendars: {
            'equipo.ventas@group.calendar.google.com': {
              busy: [{ start: '2026-01-06T15:00:00.000Z', end: '2026-01-06T16:00:00.000Z' }],
            },
          },
        },
      });

      const slots = await service.getAvailability('soporte', '2026-01-06');

      expect(freebusyQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            items: [{ id: 'equipo.ventas@group.calendar.google.com' }],
          }),
        }),
      );
      expect(slots).toHaveLength(8);
      expect(slots).not.toContain('2026-01-06T15:00:00.000Z');
    });
  });

  describe('getAvailability — free/busy del grupo de soporte', () => {
    it('asks for the group alongside the target calendar, with both expansion caps', async () => {
      mockCalendarClient.availabilityGroupEmail = GROUP;
      freebusyQuery.mockResolvedValue(freeDay());

      await service.getAvailability('soporte', '2026-01-06');

      expect(freebusyQuery).toHaveBeenCalledWith({
        requestBody: expect.objectContaining({
          items: [{ id: 'primary' }, { id: GROUP }],
          groupExpansionMax: 100,
          calendarExpansionMax: 50,
        }),
      });
    });

    it('asks only for the target calendar when no group is configured', async () => {
      freebusyQuery.mockResolvedValue(freeDay());

      await service.getAvailability('soporte', '2026-01-06');

      expect(freebusyQuery).toHaveBeenCalledWith({
        requestBody: expect.objectContaining({ items: [{ id: 'primary' }] }),
      });
    });

    // El test que falla si alguien vuelve a leer solo `data.calendars[calendarId]`: Google no
    // devuelve una entrada con la clave del grupo, sino una por cada calendario miembro.
    it('excludes a slot busy on an expanded group member calendar', async () => {
      mockCalendarClient.availabilityGroupEmail = GROUP;
      freebusyQuery.mockResolvedValue({
        data: {
          calendars: {
            primary: { busy: [] },
            'ana@fractalops.com.mx': {
              busy: [{ start: '2026-01-06T15:00:00.000Z', end: '2026-01-06T16:00:00.000Z' }],
            },
          },
        },
      });

      const slots = await service.getAvailability('soporte', '2026-01-06');

      expect(slots).toHaveLength(8);
      expect(slots).not.toContain('2026-01-06T15:00:00.000Z');
    });

    it('ignores a member calendar that came back with errors', async () => {
      mockCalendarClient.availabilityGroupEmail = GROUP;
      freebusyQuery.mockResolvedValue({
        data: {
          calendars: {
            primary: { busy: [] },
            'ana@fractalops.com.mx': { errors: [{ domain: 'global', reason: 'notFound' }] },
          },
        },
      });

      const slots = await service.getAvailability('soporte', '2026-01-06');

      expect(slots).toHaveLength(9);
    });

    it('fails closed when the target calendar itself came back with errors', async () => {
      freebusyQuery.mockResolvedValue({
        data: { calendars: { primary: { errors: [{ domain: 'global', reason: 'notFound' }] } } },
      });

      await expect(service.getAvailability('soporte', '2026-01-06')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('fails closed when free/busy returned no calendars at all', async () => {
      freebusyQuery.mockResolvedValue({ data: { calendars: {} } });

      await expect(service.getAvailability('soporte', '2026-01-06')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('survives a group that could not be expanded', async () => {
      mockCalendarClient.availabilityGroupEmail = GROUP;
      freebusyQuery.mockResolvedValue({
        data: {
          calendars: { primary: { busy: [] } },
          groups: { [GROUP]: { errors: [{ domain: 'global', reason: 'groupTooLarge' }] } },
        },
      });

      const slots = await service.getAvailability('soporte', '2026-01-06');

      expect(slots).toHaveLength(9);
    });
  });

  // La rejilla del mes pinta en gris los días sin hueco, así que necesita saberlo de todos los
  // días de golpe. Antes había que clicar día por día para descubrirlo.
  describe('getAvailableDays', () => {
    it('returns the weekdays that have at least one slot, skipping the weekend', async () => {
      freebusyQuery.mockResolvedValue(freeDay());

      const days = await service.getAvailableDays('soporte', '2026-01-05', '2026-01-11');

      // 10 y 11 de enero son sábado y domingo.
      expect(days).toEqual(['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09']);
    });

    it('drops a day whose business hours are fully booked', async () => {
      freebusyQuery.mockResolvedValue({
        data: {
          calendars: {
            primary: {
              busy: [{ start: '2026-01-06T15:00:00.000Z', end: '2026-01-07T00:00:00.000Z' }],
            },
          },
        },
      });

      const days = await service.getAvailableDays('soporte', '2026-01-05', '2026-01-09');

      expect(days).not.toContain('2026-01-06');
      expect(days).toContain('2026-01-07');
    });

    it('queries free/busy once for the whole range, not once per day', async () => {
      freebusyQuery.mockResolvedValue(freeDay());

      await service.getAvailableDays('soporte', '2026-01-05', '2026-01-09');

      expect(freebusyQuery).toHaveBeenCalledTimes(1);
      expect(freebusyQuery).toHaveBeenCalledWith({
        requestBody: expect.objectContaining({
          timeMin: '2026-01-05T15:00:00.000Z',
          timeMax: '2026-01-10T00:00:00.000Z',
        }),
      });
    });

    it('returns nothing, and asks Google nothing, for a weekend-only range', async () => {
      const days = await service.getAvailableDays('soporte', '2026-01-10', '2026-01-11');

      expect(days).toEqual([]);
      expect(freebusyQuery).not.toHaveBeenCalled();
    });

    it('rejects an inverted range', async () => {
      await expect(service.getAvailableDays('soporte', '2026-01-09', '2026-01-05')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a range wider than the cap', async () => {
      await expect(service.getAvailableDays('soporte', '2026-01-05', '2026-04-05')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('excludes days beyond the maximum advance window', async () => {
      freebusyQuery.mockResolvedValue(freeDay());

      // 30 días desde el 5 de enero llegan al 4 de febrero: el 9 de febrero queda fuera.
      const days = await service.getAvailableDays('soporte', '2026-02-05', '2026-02-10');

      expect(days).not.toContain('2026-02-09');
    });
  });

  describe('createBooking', () => {
    it('creates a calendar event with Meet conferencing and returns the confirmation', async () => {
      freebusyQuery.mockResolvedValue(freeDay());

      const confirmation = await service.createBooking(bookingDto, 'jane@example.com');

      expect(confirmation.eventId).toBe('evt-1');
      expect(confirmation.meetLink).toBe('https://meet.google.com/abc-defg-hij');
      expect(eventsInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: 'primary',
          conferenceDataVersion: 1,
          sendUpdates: 'all',
          requestBody: expect.objectContaining({
            attendees: [{ email: 'jane@example.com', displayName: 'Jane Doe' }],
            conferenceData: expect.objectContaining({
              createRequest: expect.objectContaining({
                conferenceSolutionKey: { type: 'hangoutsMeet' },
              }),
            }),
            reminders: {
              useDefault: false,
              overrides: [
                { method: 'email', minutes: 60 },
                { method: 'popup', minutes: 10 },
              ],
            },
          }),
        }),
      );
    });

    it('invites the attendee from the caller, never one carried in the payload', async () => {
      freebusyQuery.mockResolvedValue(freeDay());

      await service.createBooking(
        { ...bookingDto, attendeeEmail: 'spoofed@evil.example' } as never,
        'jwt@example.com',
      );

      const { requestBody } = eventsInsert.mock.calls[0][0];
      expect(requestBody.attendees).toEqual([
        { email: 'jwt@example.com', displayName: 'Jane Doe' },
      ]);
    });

    it('adds the support group as a second attendee when configured', async () => {
      mockCalendarClient.availabilityGroupEmail = GROUP;
      freebusyQuery.mockResolvedValue(freeDay());

      await service.createBooking(bookingDto, 'jane@example.com');

      const { requestBody } = eventsInsert.mock.calls[0][0];
      expect(requestBody.attendees).toEqual([
        { email: 'jane@example.com', displayName: 'Jane Doe' },
        { email: GROUP },
      ]);
    });

    it('rejects a slot that got booked in the meantime', async () => {
      freebusyQuery.mockResolvedValue({
        data: {
          calendars: {
            primary: { busy: [{ start: '2026-01-06T15:00:00.000Z', end: '2026-01-06T16:00:00.000Z' }] },
          },
        },
      });

      await expect(service.createBooking(bookingDto, 'jane@example.com')).rejects.toThrow(
        BadRequestException,
      );
      expect(eventsInsert).not.toHaveBeenCalled();
    });

    it('rejects a startTime in the past', async () => {
      await expect(
        service.createBooking({ ...bookingDto, startTime: '2020-01-01T00:00:00.000Z' }, 'jane@example.com'),
      ).rejects.toThrow(BadRequestException);
      expect(freebusyQuery).not.toHaveBeenCalled();
    });

    it('creates the event on the configured non-primary calendar, not "primary"', async () => {
      mockCalendarClient.calendarId = 'equipo.ventas@group.calendar.google.com';
      freebusyQuery.mockResolvedValue({
        data: { calendars: { 'equipo.ventas@group.calendar.google.com': { busy: [] } } },
      });

      await service.createBooking(bookingDto, 'jane@example.com');

      expect(eventsInsert).toHaveBeenCalledWith(
        expect.objectContaining({ calendarId: 'equipo.ventas@group.calendar.google.com' }),
      );
    });

    it('queries free/busy exactly once', async () => {
      freebusyQuery.mockResolvedValue(freeDay());

      await service.createBooking(bookingDto, 'jane@example.com');

      expect(freebusyQuery).toHaveBeenCalledTimes(1);
    });

    it('accepts the last slot of the business day', async () => {
      freebusyQuery.mockResolvedValue(freeDay());

      await service.createBooking(
        { ...bookingDto, startTime: '2026-01-06T23:00:00.000Z' },
        'jane@example.com',
      );

      expect(eventsInsert).toHaveBeenCalled();
    });
  });

  // Antes `createBooking` solo comprobaba que el hueco estuviera libre en free/busy, así que
  // aceptaba cualquier hora que nadie hubiera ocupado — domingo a las 3 AM incluido. Ahora se
  // revalida contra los slots que de verdad se ofrecen.
  describe('createBooking — startTime fuera de los slots ofrecidos', () => {
    beforeEach(() => {
      freebusyQuery.mockResolvedValue(freeDay());
    });

    it('rejects a startTime that is off the hourly grid', async () => {
      await expect(
        service.createBooking({ ...bookingDto, startTime: '2026-01-06T15:17:00.000Z' }, 'jane@example.com'),
      ).rejects.toThrow(BadRequestException);
      expect(eventsInsert).not.toHaveBeenCalled();
    });

    it('rejects a startTime on a weekend without even asking Google', async () => {
      // 2026-01-11 es domingo; 15:00 UTC son las 09:00 locales.
      await expect(
        service.createBooking({ ...bookingDto, startTime: '2026-01-11T15:00:00.000Z' }, 'jane@example.com'),
      ).rejects.toThrow(BadRequestException);
      expect(freebusyQuery).not.toHaveBeenCalled();
      expect(eventsInsert).not.toHaveBeenCalled();
    });

    it('rejects a startTime outside business hours', async () => {
      // 09:00 UTC son las 03:00 en Ciudad de México.
      await expect(
        service.createBooking({ ...bookingDto, startTime: '2026-01-06T09:00:00.000Z' }, 'jane@example.com'),
      ).rejects.toThrow(BadRequestException);
      expect(eventsInsert).not.toHaveBeenCalled();
    });

    it('rejects a startTime inside the minimum-notice window', async () => {
      // Ahora son las 12:00 UTC del lunes 5 y la anticipación mínima es de 4 h: el slot de las
      // 15:00 UTC de hoy sigue siendo un hueco válido de la rejilla, pero llega demasiado justo.
      await expect(
        service.createBooking({ ...bookingDto, startTime: '2026-01-05T15:00:00.000Z' }, 'jane@example.com'),
      ).rejects.toThrow(BadRequestException);
      expect(eventsInsert).not.toHaveBeenCalled();
    });

    it('rejects a startTime beyond the maximum advance window', async () => {
      // 30 días desde el 5 de enero llegan al 4 de febrero; el lunes 9 queda fuera.
      await expect(
        service.createBooking({ ...bookingDto, startTime: '2026-02-09T15:00:00.000Z' }, 'jane@example.com'),
      ).rejects.toThrow(BadRequestException);
      expect(eventsInsert).not.toHaveBeenCalled();
    });
  });
});
