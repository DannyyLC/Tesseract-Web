export const BOOKING_EVENT_TYPE_IDS = [
  'nuevo-workflow',
  'soporte',
  'consultoria',
  'demo',
  'enterprise',
] as const;

export type BookingEventTypeId = (typeof BOOKING_EVENT_TYPE_IDS)[number];

export interface BookingEventType {
  id: BookingEventTypeId;
  title: string;
  description: string;
  durationMinutes: number;
}

export interface BookingAvailabilityResponse {
  /** Horarios de inicio disponibles, ISO 8601 en UTC. */
  slots: string[];
  timezone: string;
}

export interface CreateBookingDto {
  eventTypeId: BookingEventTypeId;
  /** ISO 8601 en UTC — debe ser uno de los valores devueltos por /booking/availability. */
  startTime: string;
  attendeeName: string;
  attendeeEmail: string;
  notes?: string;
}

export interface BookingConfirmation {
  eventId: string;
  meetLink: string | null;
  htmlLink: string;
  startTime: string;
  endTime: string;
  eventTypeId: BookingEventTypeId;
}

export interface BookingCalendarStatus {
  connected: boolean;
  googleAccountEmail: string | null;
  /** Calendario activo donde se crean los eventos ("primary" u otro de la cuenta conectada). */
  calendarId: string | null;
}

export interface BookingCalendarListItem {
  /** Id que espera `calendarId` al crear/consultar eventos (p.ej. "primary" o un email de grupo). */
  id: string;
  summary: string;
  primary: boolean;
}

export interface SelectBookingCalendarDto {
  calendarId: string;
}
