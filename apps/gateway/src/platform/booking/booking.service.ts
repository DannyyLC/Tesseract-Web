import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { calendar_v3 } from 'googleapis';
import { zonedDayKey, zonedTimeToUtc } from '@/platform/common/utils/zoned-dates';
import { BookingConfirmation, CreateBookingDto } from '@tesseract/types';
import { BookingCalendarService } from './booking-calendar.service';
import {
  BOOKING_BUSINESS_HOURS,
  BOOKING_MAX_ADVANCE_DAYS,
  BOOKING_MIN_NOTICE_HOURS,
  BOOKING_REMINDERS,
  BOOKING_SLOT_INTERVAL_MINUTES,
  BOOKING_TIMEZONE,
  getBookingEventType,
} from './booking-event-types.config';

/** Topes que impone la API de free/busy al expandir un grupo y sus calendarios. */
const GROUP_EXPANSION_MAX = 100;
const CALENDAR_EXPANSION_MAX = 50;

interface BusyPeriod {
  start: number;
  end: number;
}

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(private readonly calendarClient: BookingCalendarService) {}

  async getAvailability(eventTypeId: string, dateKey: string): Promise<string[]> {
    const eventType = getBookingEventType(eventTypeId);
    const { year, month, day } = parseDateKey(dateKey);

    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (!BOOKING_BUSINESS_HOURS.workDays.includes(weekday)) {
      return [];
    }

    const dayStart = zonedTimeToUtc(year, month, day, BOOKING_BUSINESS_HOURS.startHour, BOOKING_TIMEZONE);
    const dayEnd = zonedTimeToUtc(year, month, day, BOOKING_BUSINESS_HOURS.endHour, BOOKING_TIMEZONE);

    const now = new Date();
    const earliestBookable = new Date(now.getTime() + BOOKING_MIN_NOTICE_HOURS * 60 * 60 * 1000);
    const latestBookable = new Date(now.getTime() + BOOKING_MAX_ADVANCE_DAYS * 24 * 60 * 60 * 1000);
    if (dayStart > latestBookable || dayEnd < earliestBookable) {
      return [];
    }

    const calendar = await this.calendarClient.getClient();
    const busy = await this.queryBusy(calendar, dayStart.toISOString(), dayEnd.toISOString());

    const durationMs = eventType.durationMinutes * 60 * 1000;
    const intervalMs = BOOKING_SLOT_INTERVAL_MINUTES * 60 * 1000;
    const slots: string[] = [];

    for (let slotStart = dayStart.getTime(); slotStart + durationMs <= dayEnd.getTime(); slotStart += intervalMs) {
      const slotEnd = slotStart + durationMs;
      if (slotStart < earliestBookable.getTime()) continue;

      const overlaps = busy.some((period) => slotStart < period.end && slotEnd > period.start);
      if (!overlaps) {
        slots.push(new Date(slotStart).toISOString());
      }
    }

    return slots;
  }

  async createBooking(dto: CreateBookingDto, attendeeEmail: string): Promise<BookingConfirmation> {
    const eventType = getBookingEventType(dto.eventTypeId);
    const startTime = new Date(dto.startTime);

    // Guard barato antes de tocar la red: `zonedDayKey` con un Invalid Date no tiene sentido.
    if (Number.isNaN(startTime.getTime()) || startTime.getTime() < Date.now()) {
      throw new BadRequestException('Invalid or past startTime');
    }

    const endTime = new Date(startTime.getTime() + eventType.durationMinutes * 60 * 1000);

    // Revalidar contra los slots que de verdad se ofrecen, no solo contra free/busy: así quedan
    // cubiertos de un golpe el fin de semana, el horario laboral, la rejilla de la hora en punto,
    // la anticipación mínima, la ventana máxima y la ocupación. El día hay que derivarlo en la
    // zona de la agenda — con `getUTCDate()` cualquier slot de la tarde cae en el día UTC
    // siguiente y se revalidaría contra el día equivocado.
    const dayKey = zonedDayKey(startTime, BOOKING_TIMEZONE);
    const slots = await this.getAvailability(dto.eventTypeId, dayKey);
    if (!slots.includes(startTime.toISOString())) {
      throw new BadRequestException('This time slot is no longer available');
    }

    const calendar = await this.calendarClient.getClient();
    const group = this.calendarClient.availabilityGroupEmail;

    const { data: event } = await calendar.events.insert({
      calendarId: this.calendarClient.calendarId,
      conferenceDataVersion: 1,
      sendUpdates: 'all',
      requestBody: {
        summary: `${eventType.title} — ${dto.attendeeName}`,
        description: dto.notes ?? eventType.description,
        start: { dateTime: startTime.toISOString(), timeZone: BOOKING_TIMEZONE },
        end: { dateTime: endTime.toISOString(), timeZone: BOOKING_TIMEZONE },
        // Invitar al grupo hace que la cita aparezca en el calendario personal de cada miembro
        // del equipo y no solo en el calendario compartido, donde nadie la vería.
        attendees: [
          { email: attendeeEmail, displayName: dto.attendeeName },
          ...(group ? [{ email: group }] : []),
        ],
        conferenceData: {
          createRequest: {
            requestId: randomUUID(),
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
        reminders: {
          useDefault: false,
          overrides: BOOKING_REMINDERS,
        },
      },
    });

    return {
      eventId: event.id!,
      meetLink: event.hangoutLink ?? null,
      htmlLink: event.htmlLink!,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      eventTypeId: eventType.id,
    };
  }

  /**
   * Ocupación del calendario destino más, si está configurado, la del grupo de soporte.
   *
   * Google no devuelve una entrada `calendars[<email del grupo>]`: expande el grupo y devuelve
   * **una entrada por cada calendario miembro**, con su propio email como clave. Por eso hay que
   * unir el `busy` de todas las entradas — quedarse con la del calendario destino dejaría al
   * grupo sin ningún efecto, en silencio, y se seguiría reservando encima de gente ocupada.
   */
  private async queryBusy(
    calendar: calendar_v3.Calendar,
    timeMin: string,
    timeMax: string,
  ): Promise<BusyPeriod[]> {
    const calendarId = this.calendarClient.calendarId;
    const group = this.calendarClient.availabilityGroupEmail;

    const { data } = await calendar.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        timeZone: BOOKING_TIMEZONE,
        groupExpansionMax: GROUP_EXPANSION_MAX,
        calendarExpansionMax: CALENDAR_EXPANSION_MAX,
        items: group ? [{ id: calendarId }, { id: group }] : [{ id: calendarId }],
      },
    });

    // Pasar de los topes de expansión no devuelve un resultado parcial: devuelve un error en esa
    // entrada. Si no se mira, el grupo entero parecería libre.
    for (const [groupId, entry] of Object.entries(data.groups ?? {})) {
      if (entry.errors?.length) {
        this.logger.warn(
          `Free/busy no pudo expandir el grupo ${groupId}: ${JSON.stringify(entry.errors)}`,
        );
      }
    }

    const entries = Object.entries(data.calendars ?? {});
    if (entries.length === 0) {
      throw new ServiceUnavailableException('Free/busy no devolvió ningún calendario.');
    }

    const targetFailed = data.calendars?.[calendarId]?.errors?.length;
    const allFailed = entries.every(([, entry]) => entry.errors?.length);
    // Fail-closed asimétrico: si no se pudo leer el calendario destino —o no se pudo leer nada—
    // ofrecer el día entero como libre es peor que devolver un error. Un miembro suelto del
    // grupo sin permisos, en cambio, no debe tumbar la agenda.
    if (targetFailed || allFailed) {
      this.logger.error(`Free/busy falló para el calendario destino: ${JSON.stringify(data.calendars)}`);
      throw new ServiceUnavailableException('No se pudo consultar la disponibilidad del calendario.');
    }

    const busy: BusyPeriod[] = [];
    for (const [id, entry] of entries) {
      if (entry.errors?.length) {
        this.logger.warn(`Free/busy ignoró ${id}: ${JSON.stringify(entry.errors)}`);
        continue;
      }
      for (const period of entry.busy ?? []) {
        busy.push({
          start: new Date(period.start!).getTime(),
          end: new Date(period.end!).getTime(),
        });
      }
    }

    return busy;
  }
}

function parseDateKey(dateKey: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) {
    throw new BadRequestException('date must be in YYYY-MM-DD format');
  }
  const [, year, month, day] = match;
  return { year: Number(year), month: Number(month), day: Number(day) };
}
