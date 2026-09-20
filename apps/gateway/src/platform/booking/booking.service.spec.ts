import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { google } from 'googleapis';
import { BookingService } from './booking.service';
import { PrismaService } from '@/platform/database/prisma.service';
import { KmsService } from '@/automation/tools/core/kms.service';

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({ setCredentials: jest.fn() })),
    },
    calendar: jest.fn(),
  },
}));

describe('BookingService', () => {
  let service: BookingService;
  const freebusyQuery = jest.fn();
  const eventsInsert = jest.fn();

  const mockPrisma = {
    bookingCalendarCredential: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'cred-1',
        googleAccountEmail: 'ventas@tesseract.dev',
        encryptedRefreshToken: 'encrypted',
      }),
    },
  };

  const mockKms = {
    decrypt: jest.fn().mockResolvedValue('plain-refresh-token'),
  };

  const mockConfig = {
    get: jest.fn((key: string) => {
      const map: Record<string, string> = {
        GOOGLE_CLIENT_ID: 'client-id',
        GOOGLE_CLIENT_SECRET: 'client-secret',
      };
      return map[key];
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.bookingCalendarCredential.findFirst.mockResolvedValue({
      id: 'cred-1',
      googleAccountEmail: 'ventas@tesseract.dev',
      encryptedRefreshToken: 'encrypted',
    });
    mockKms.decrypt.mockResolvedValue('plain-refresh-token');
    (google.calendar as jest.Mock).mockReturnValue({
      freebusy: { query: freebusyQuery },
      events: { insert: eventsInsert },
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: KmsService, useValue: mockKms },
        { provide: ConfigService, useValue: mockConfig },
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
    it('returns 9 hourly slots for a full free business day (9am-6pm, 30min event)', async () => {
      freebusyQuery.mockResolvedValue({ data: { calendars: { primary: { busy: [] } } } });

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

    it('throws when no calendar has been connected yet', async () => {
      mockPrisma.bookingCalendarCredential.findFirst.mockResolvedValue(null);

      await expect(service.getAvailability('soporte', '2026-01-06')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('createBooking', () => {
    it('creates a calendar event with Meet conferencing and returns the confirmation', async () => {
      freebusyQuery.mockResolvedValue({ data: { calendars: { primary: { busy: [] } } } });
      eventsInsert.mockResolvedValue({
        data: {
          id: 'evt-1',
          hangoutLink: 'https://meet.google.com/abc-defg-hij',
          htmlLink: 'https://calendar.google.com/event?eid=abc',
        },
      });

      const confirmation = await service.createBooking({
        eventTypeId: 'soporte',
        startTime: '2026-01-06T15:00:00.000Z',
        attendeeName: 'Jane Doe',
        attendeeEmail: 'jane@example.com',
      });

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

    it('rejects a slot that got booked in the meantime', async () => {
      freebusyQuery.mockResolvedValue({
        data: {
          calendars: {
            primary: { busy: [{ start: '2026-01-06T15:00:00.000Z', end: '2026-01-06T15:30:00.000Z' }] },
          },
        },
      });

      await expect(
        service.createBooking({
          eventTypeId: 'soporte',
          startTime: '2026-01-06T15:00:00.000Z',
          attendeeName: 'Jane Doe',
          attendeeEmail: 'jane@example.com',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(eventsInsert).not.toHaveBeenCalled();
    });

    it('rejects a startTime in the past', async () => {
      await expect(
        service.createBooking({
          eventTypeId: 'soporte',
          startTime: '2020-01-01T00:00:00.000Z',
          attendeeName: 'Jane Doe',
          attendeeEmail: 'jane@example.com',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
