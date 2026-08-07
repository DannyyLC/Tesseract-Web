/**
 * Utilidades de fecha con zona horaria, construidas sobre `Intl`.
 *
 * El monorepo no tiene librería de fechas en TypeScript (ni date-fns ni luxon) y esto
 * no justifica añadir una: `Intl` ya conoce la base de datos IANA, incluidos los
 * cambios de horario de verano.
 *
 * Existe porque las columnas `DateTime` de Prisma son `timestamp(3)` **sin** zona: el
 * contenido es UTC, pero nada en el tipo lo dice. Agrupar por día u hora "local" exige
 * convertir explícitamente, y hacerlo con los getters nativos de `Date`
 * (`getHours`, `getFullYear`, …) usa la zona del proceso Node — UTC en Cloud Run —,
 * que es justo el error que estas funciones existen para evitar.
 */

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Lee las partes de un instante tal y como se ven en `timeZone`. */
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);

  const read = (type: string): number => {
    const found = parts.find((part) => part.type === type);
    return found ? Number(found.value) : 0;
  };

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

/** Desfase de `timeZone` respecto a UTC, en ms, para ese instante concreto. */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = zonedParts(date, timeZone);
  const asIfUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asIfUtc - (date.getTime() - date.getUTCMilliseconds());
}

/**
 * Instante UTC que corresponde a una hora de pared en `timeZone`.
 *
 * Se afina en dos pasadas porque el desfase depende del propio instante: en los días de
 * cambio de horario, el offset de la primera estimación puede ser el del lado
 * equivocado de la transición.
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  timeZone: string,
): Date {
  const wallClock = Date.UTC(year, month - 1, day, hour);
  const firstPass = wallClock - zoneOffsetMs(new Date(wallClock), timeZone);
  const secondPass = wallClock - zoneOffsetMs(new Date(firstPass), timeZone);
  return new Date(secondPass);
}

/** Medianoche local del día al que pertenece `date` en `timeZone`. */
export function startOfDayInZone(date: Date, timeZone: string): Date {
  const parts = zonedParts(date, timeZone);
  return zonedTimeToUtc(parts.year, parts.month, parts.day, 0, timeZone);
}

/** Medianoche local del primer día del mes al que pertenece `date`. */
export function startOfMonthInZone(date: Date, timeZone: string): Date {
  const parts = zonedParts(date, timeZone);
  return zonedTimeToUtc(parts.year, parts.month, 1, 0, timeZone);
}

/** Medianoche local del lunes de la semana a la que pertenece `date`. */
export function startOfWeekInZone(date: Date, timeZone: string): Date {
  const midnight = startOfDayInZone(date, timeZone);
  // getUTCDay sobre la medianoche local da el día de la semana correcto porque
  // zonedTimeToUtc ya dejó el instante alineado con el arranque del día local.
  const parts = zonedParts(midnight, timeZone);
  const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  return addDaysInZone(midnight, -daysSinceMonday, timeZone);
}

/**
 * Suma días de calendario en `timeZone`, no múltiplos de 24 h.
 *
 * La distinción importa los días de cambio de horario, que duran 23 o 25 horas: sumar
 * 86 400 000 ms dejaría la serie desplazada una hora a partir de ese punto.
 */
export function addDaysInZone(date: Date, days: number, timeZone: string): Date {
  const parts = zonedParts(date, timeZone);
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return zonedTimeToUtc(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
    0,
    timeZone,
  );
}

/** Suma meses de calendario en `timeZone`, apuntando al día 1. */
export function addMonthsInZone(date: Date, months: number, timeZone: string): Date {
  const parts = zonedParts(date, timeZone);
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1 + months, 1));
  return zonedTimeToUtc(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 1, 0, timeZone);
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** Clave `YYYY-MM-DD` en `timeZone`. Coincide con `TO_CHAR(..., 'YYYY-MM-DD')`. */
export function zonedDayKey(date: Date, timeZone: string): string {
  const { year, month, day } = zonedParts(date, timeZone);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Clave `YYYY-MM-DD HH:00:00` en `timeZone`. Coincide con `'YYYY-MM-DD HH24:00:00'`. */
export function zonedHourKey(date: Date, timeZone: string): string {
  const { year, month, day, hour } = zonedParts(date, timeZone);
  return `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:00:00`;
}

/** Clave `YYYY-MM` en `timeZone`. Coincide con `TO_CHAR(..., 'YYYY-MM')`. */
export function zonedMonthKey(date: Date, timeZone: string): string {
  const { year, month } = zonedParts(date, timeZone);
  return `${year}-${pad(month)}`;
}

/**
 * Clave `IYYY-"W"IW` en `timeZone`. Coincide con `TO_CHAR(..., 'IYYY-"W"IW')`.
 *
 * Usa año y semana **ISO**, que no siempre son los del calendario: el 1 de enero puede
 * caer en la semana 52 del año anterior, y por eso el año se toma del jueves de esa
 * misma semana en vez del de la fecha original.
 */
export function zonedIsoWeekKey(date: Date, timeZone: string): string {
  const { year, month, day } = zonedParts(date, timeZone);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const dayNumber = (utcDate.getUTCDay() + 6) % 7;
  // El jueves de la semana ISO determina a qué año pertenece.
  const thursday = new Date(utcDate);
  thursday.setUTCDate(utcDate.getUTCDate() - dayNumber + 3);

  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);

  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${thursday.getUTCFullYear()}-W${pad(week)}`;
}
