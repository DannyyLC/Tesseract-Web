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

export interface BookingAvailableDaysResponse {
  /** Claves `YYYY-MM-DD` con al menos un hueco libre. Las demás del rango están llenas. */
  days: string[];
  timezone: string;
}

export interface CreateBookingDto {
  eventTypeId: BookingEventTypeId;
  /**
   * ISO 8601 en UTC — debe ser uno de los valores devueltos por /booking/availability. El
   * gateway lo revalida contra esa misma lista antes de crear el evento.
   */
  startTime: string;
  attendeeName: string;
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
