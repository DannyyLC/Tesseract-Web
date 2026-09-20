import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { google } from 'googleapis';
import { PrismaService } from '@/platform/database/prisma.service';
import { KmsService } from '@/automation/tools/core/kms.service';
import { zonedTimeToUtc } from '@/platform/common/utils/zoned-dates';
import { BookingConfirmation, CreateBookingDto } from '@tesseract/types';
import {
  BOOKING_BUSINESS_HOURS,
  BOOKING_MAX_ADVANCE_DAYS,
  BOOKING_MIN_NOTICE_HOURS,
  BOOKING_REMINDERS,
  BOOKING_SLOT_INTERVAL_MINUTES,
  BOOKING_TIMEZONE,
  getBookingEventType,
} from './booking-event-types.config';

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly kms: KmsService,
  ) {}

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

    const { calendar, calendarId } = await this.getCalendarClient();
    const freeBusy = await calendar.freebusy.query({
      requestBody: {
        timeMin: dayStart.toISOString(),
        timeMax: dayEnd.toISOString(),
        items: [{ id: calendarId }],
      },
    });
    const busy = freeBusy.data.calendars?.[calendarId]?.busy ?? [];

    const durationMs = eventType.durationMinutes * 60 * 1000;
    const intervalMs = BOOKING_SLOT_INTERVAL_MINUTES * 60 * 1000;
    const slots: string[] = [];

    for (let slotStart = dayStart.getTime(); slotStart + durationMs <= dayEnd.getTime(); slotStart += intervalMs) {
      const slotEnd = slotStart + durationMs;
      if (slotStart < earliestBookable.getTime()) continue;

      const overlaps = busy.some((period) => {
        const busyStart = new Date(period.start!).getTime();
        const busyEnd = new Date(period.end!).getTime();
        return slotStart < busyEnd && slotEnd > busyStart;
      });
      if (!overlaps) {
        slots.push(new Date(slotStart).toISOString());
      }
    }

    return slots;
  }

  async createBooking(dto: CreateBookingDto): Promise<BookingConfirmation> {
    const eventType = getBookingEventType(dto.eventTypeId);
    const startTime = new Date(dto.startTime);
    const endTime = new Date(startTime.getTime() + eventType.durationMinutes * 60 * 1000);

    if (Number.isNaN(startTime.getTime()) || startTime.getTime() < Date.now()) {
      throw new BadRequestException('Invalid or past startTime');
    }

    const { calendar, calendarId } = await this.getCalendarClient();

    // Revalida justo antes de crear el evento: el slot pudo ocuparse entre que el usuario lo
    // vio en pantalla y le dio a confirmar.
    const freeBusy = await calendar.freebusy.query({
      requestBody: {
        timeMin: startTime.toISOString(),
        timeMax: endTime.toISOString(),
        items: [{ id: calendarId }],
      },
    });
    const busy = freeBusy.data.calendars?.[calendarId]?.busy ?? [];
    if (busy.length > 0) {
      throw new BadRequestException('This time slot is no longer available');
    }

    const { data: event } = await calendar.events.insert({
      calendarId,
      conferenceDataVersion: 1,
      sendUpdates: 'all',
      requestBody: {
        summary: `${eventType.title} — ${dto.attendeeName}`,
        description: dto.notes ?? eventType.description,
        start: { dateTime: startTime.toISOString(), timeZone: BOOKING_TIMEZONE },
        end: { dateTime: endTime.toISOString(), timeZone: BOOKING_TIMEZONE },
        attendees: [{ email: dto.attendeeEmail, displayName: dto.attendeeName }],
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

  private async getCalendarClient() {
    const credential = await this.prisma.bookingCalendarCredential.findFirst();
    if (!credential) {
      throw new BadRequestException(
        'No booking calendar connected yet. A SUPER_ADMIN must connect one at GET /booking/admin/connect-url.',
      );
    }

    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    const refreshToken = await this.kms.decrypt(credential.encryptedRefreshToken);

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    return {
      calendar: google.calendar({ version: 'v3', auth: oauth2Client }),
      calendarId: credential.calendarId,
    };
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
