import { BadRequestException } from '@nestjs/common';
import { BookingEventType, BookingEventTypeId } from '@tesseract/types';

/**
 * Las sesiones que ofrece el propio equipo de Tesseract. No son configurables por tenant, así
 * que viven en código y no en la base de datos: cambiarlas es un cambio de producto, no un dato
 * que nadie vaya a editar desde un panel.
 */
export const BOOKING_EVENT_TYPES: Record<BookingEventTypeId, BookingEventType> = {
  'nuevo-workflow': {
    id: 'nuevo-workflow',
    title: 'Nuevo workflow',
    description: 'Sesión para levantar un nuevo workflow de automatización con el equipo.',
    durationMinutes: 60,
  },
  soporte: {
    id: 'soporte',
    title: 'Soporte técnico y debugging',
    description: 'Sesión de soporte técnico para resolver un problema puntual.',
    durationMinutes: 60,
  },
  consultoria: {
    id: 'consultoria',
    title: 'Consultoría estratégica y técnica',
    description: 'Sesión de consultoría sobre estrategia o arquitectura de automatización.',
    durationMinutes: 60,
  },
  demo: {
    id: 'demo',
    title: 'Demo',
    description: 'Demostración de la plataforma.',
    durationMinutes: 60,
  },
  enterprise: {
    id: 'enterprise',
    title: 'Solicitud de plan Enterprise',
    description: 'Conversación con ventas sobre el plan Enterprise.',
    durationMinutes: 60,
  },
};

export function getBookingEventType(id: string): BookingEventType {
  const eventType = BOOKING_EVENT_TYPES[id as BookingEventTypeId];
  if (!eventType) {
    throw new BadRequestException(`Unknown booking event type: ${id}`);
  }
  return eventType;
}

/** Agenda propia de Tesseract — no depende de la organización de quien reserva por ahora. */
export const BOOKING_TIMEZONE = 'America/Mexico_City';

export const BOOKING_BUSINESS_HOURS = {
  /** Lunes-viernes (1-5, ISO). Fin de semana no tiene horarios disponibles. */
  workDays: [1, 2, 3, 4, 5],
  startHour: 9,
  endHour: 18,
};

/** Cada slot ofrecido empieza en un múltiplo de 60 min dentro del horario laboral. */
export const BOOKING_SLOT_INTERVAL_MINUTES = 60;

/** No se puede reservar con menos de esta anticipación. */
export const BOOKING_MIN_NOTICE_HOURS = 4;

/** Máximo de días hacia adelante que se pueden consultar/reservar. */
export const BOOKING_MAX_ADVANCE_DAYS = 30;

/**
 * Recordatorios del evento, aparte de la invitación inicial que ya manda `sendUpdates: 'all'`
 * al crearlo. `useDefault: false` en el evento para que Calendar use estos en vez de los
 * recordatorios por defecto de la cuenta de Workspace suplantada (que podrían no existir o
 * ser otros).
 */
export const BOOKING_REMINDERS: { method: 'email' | 'popup'; minutes: number }[] = [
  { method: 'email', minutes: 60 },
  { method: 'popup', minutes: 10 },
];
