/**
 * Zonas horarias ofrecidas en los selectores de la UI.
 *
 * **No es una lista blanca de validación.** El gateway acepta cualquier identificador
 * IANA válido (`isValidTimezone`), porque un workflow puede configurarse por API para
 * una región que aquí no aparezca. Esta lista existe solo para que el desplegable sea
 * usable: `Intl.supportedValuesOf('timeZone')` devuelve más de cuatrocientas entradas y
 * convierte una decisión de un segundo en una búsqueda.
 *
 * El criterio para incluir una zona es que haya clientes ahí o pueda haberlos pronto.
 * Añadir una es seguro; quitarla no rompe nada tampoco, porque el valor guardado sigue
 * siendo válido aunque desaparezca del selector.
 */

/** Zona por defecto de una organización nueva. Debe coincidir con el default de la columna. */
export const DEFAULT_TIMEZONE = 'America/Mexico_City';

/** Regiones en las que se agrupa el selector. La UI traduce estas claves. */
export type TimezoneRegion = 'mexico' | 'latam' | 'northAmerica' | 'europe' | 'other';

export interface TimezoneGroup {
  region: TimezoneRegion;
  /** Identificadores IANA, en el orden en que se muestran. */
  zones: string[];
}

/**
 * Agrupadas por región para poder pintar `<optgroup>`: con veintitantas entradas
 * planas, encontrar la propia cuesta más de lo que debería.
 */
export const TIMEZONE_GROUPS: TimezoneGroup[] = [
  {
    region: 'mexico',
    zones: [
      'America/Mexico_City',
      'America/Monterrey',
      'America/Cancun',
      'America/Merida',
      'America/Chihuahua',
      'America/Mazatlan',
      'America/Hermosillo',
      'America/Tijuana',
    ],
  },
  {
    region: 'latam',
    zones: [
      'America/Bogota',
      'America/Lima',
      'America/Santiago',
      'America/Argentina/Buenos_Aires',
      'America/Sao_Paulo',
      'America/Montevideo',
      'America/Asuncion',
      'America/La_Paz',
      'America/Caracas',
      'America/Guayaquil',
      'America/Guatemala',
      'America/El_Salvador',
      'America/Tegucigalpa',
      'America/Managua',
      'America/Costa_Rica',
      'America/Panama',
      'America/Havana',
      'America/Santo_Domingo',
      'America/Puerto_Rico',
    ],
  },
  {
    region: 'northAmerica',
    zones: [
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Phoenix',
      'America/Los_Angeles',
      'America/Anchorage',
      'Pacific/Honolulu',
      'America/Toronto',
      'America/Vancouver',
    ],
  },
  {
    region: 'europe',
    zones: ['Europe/Madrid', 'Europe/London', 'Europe/Lisbon', 'Europe/Paris', 'Europe/Berlin'],
  },
  {
    region: 'other',
    zones: ['UTC'],
  },
];

/** Todas las zonas del selector, sin agrupar. Útil para tests y comprobaciones. */
export const SUPPORTED_TIMEZONES: string[] = TIMEZONE_GROUPS.flatMap((group) => group.zones);

/**
 * Nombre legible de una zona: `America/Mexico_City` → `Mexico City`.
 *
 * Se deriva del identificador en vez de traducirse para que el selector no dependa del
 * idioma activo y para que añadir una zona sea una sola línea en `TIMEZONE_GROUPS`.
 */
export function formatTimezoneName(timezone: string): string {
  const city = timezone.split('/').pop() ?? timezone;
  return city.replace(/_/g, ' ');
}

/**
 * Desfase actual respecto a UTC, ya formateado: `UTC-6`, `UTC+1`, `UTC`.
 *
 * Se calcula al vuelo con `Intl` y no se guarda, porque cambia con el horario de
 * verano: una tabla de offsets escrita a mano queda mal dos veces al año.
 */
export function formatTimezoneOffset(timezone: string, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    }).formatToParts(at);
    const offset = parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
    // `shortOffset` devuelve "GMT-6"; para el propio UTC devuelve "GMT+0" o "GMT",
    // y ahí el "+0" solo estorba.
    return offset.replace('GMT', 'UTC').replace(/UTC[+-]0$/, 'UTC') || 'UTC';
  } catch {
    return '';
  }
}

/** Etiqueta completa del selector: `Mexico City (UTC-6)`. */
export function formatTimezoneLabel(timezone: string, at: Date = new Date()): string {
  const offset = formatTimezoneOffset(timezone, at);
  const name = formatTimezoneName(timezone);
  // Para la propia UTC, nombre y desfase coinciden y "UTC (UTC)" sobra.
  if (!offset || offset === name) return name;
  return `${name} (${offset})`;
}
