import {
  DEFAULT_TIMEZONE,
  SUPPORTED_TIMEZONES,
  TIMEZONE_GROUPS,
  formatTimezoneLabel,
  formatTimezoneOffset,
} from '@tesseract/types';
import { FALLBACK_TIMEZONE, isValidTimezone, resolveTimezone } from './resolve-timezone';

describe('resolve-timezone', () => {
  describe('isValidTimezone', () => {
    it('acepta identificadores IANA', () => {
      expect(isValidTimezone('America/Mexico_City')).toBe(true);
      expect(isValidTimezone('UTC')).toBe(true);
    });

    it('rechaza lo que no lo es', () => {
      expect(isValidTimezone('Mexico City')).toBe(false);
      expect(isValidTimezone('')).toBe(false);
      expect(isValidTimezone('   ')).toBe(false);
      expect(isValidTimezone(null)).toBe(false);
      expect(isValidTimezone(undefined)).toBe(false);
      expect(isValidTimezone(42)).toBe(false);
    });
  });

  describe('resolveTimezone', () => {
    it('el workflow gana cuando define la suya', () => {
      expect(resolveTimezone('America/Mexico_City', 'America/Monterrey')).toBe('America/Monterrey');
    });

    it('hereda la de la organización cuando el workflow es null', () => {
      expect(resolveTimezone('America/Mexico_City', null)).toBe('America/Mexico_City');
      expect(resolveTimezone('America/Mexico_City')).toBe('America/Mexico_City');
    });

    it('cae a UTC cuando no hay nada válido', () => {
      expect(resolveTimezone(null, null)).toBe(FALLBACK_TIMEZONE);
      expect(resolveTimezone(undefined)).toBe('UTC');
    });

    it('descarta valores inválidos en vez de propagarlos al SQL', () => {
      // La API aceptó cualquier string durante mucho tiempo; una zona basura llegando
      // a un AT TIME ZONE reventaría la consulta entera en lugar de una sola gráfica.
      expect(resolveTimezone('America/Mexico_City', 'basura')).toBe('America/Mexico_City');
      expect(resolveTimezone('tampoco vale', 'basura')).toBe('UTC');
    });
  });

  // La lista que alimenta el selector de la UI vive en @tesseract/types. Se comprueba
  // aquí porque el paquete no tiene jest y porque el cruce interesante es justo este:
  // que todo lo que ofrecemos elegir pase nuestro propio validador.
  describe('catálogo compartido de zonas (@tesseract/types)', () => {
    it('todas las zonas del selector son identificadores IANA válidos', () => {
      const invalid = SUPPORTED_TIMEZONES.filter((tz) => !isValidTimezone(tz));
      expect(invalid).toEqual([]);
    });

    it('no tiene duplicados entre regiones', () => {
      expect(new Set(SUPPORTED_TIMEZONES).size).toBe(SUPPORTED_TIMEZONES.length);
    });

    it('incluye la zona por defecto de la columna', () => {
      expect(SUPPORTED_TIMEZONES).toContain(DEFAULT_TIMEZONE);
      expect(DEFAULT_TIMEZONE).toBe('America/Mexico_City');
    });

    it('ninguna región queda vacía', () => {
      TIMEZONE_GROUPS.forEach((group) => expect(group.zones.length).toBeGreaterThan(0));
    });

    it('formatea el desfase respetando el horario de verano', () => {
      // CDMX ya no cambia de hora desde 2022, así que su desfase es fijo todo el año.
      const enero = new Date('2026-01-15T12:00:00Z');
      const julio = new Date('2026-07-15T12:00:00Z');
      expect(formatTimezoneOffset('America/Mexico_City', enero)).toBe('UTC-6');
      expect(formatTimezoneOffset('America/Mexico_City', julio)).toBe('UTC-6');

      // Madrid sí lo hace: UTC+1 en invierno, UTC+2 en verano.
      expect(formatTimezoneOffset('Europe/Madrid', enero)).toBe('UTC+1');
      expect(formatTimezoneOffset('Europe/Madrid', julio)).toBe('UTC+2');
    });

    it('etiqueta la ciudad con su desfase, sin repetir UTC', () => {
      expect(formatTimezoneLabel('America/Mexico_City', new Date('2026-01-15T12:00:00Z'))).toBe(
        'Mexico City (UTC-6)',
      );
      expect(formatTimezoneLabel('America/Argentina/Buenos_Aires')).toContain('Buenos Aires');
      expect(formatTimezoneLabel('UTC')).toBe('UTC');
    });

    it('devuelve cadena vacía en vez de reventar con una zona inválida', () => {
      expect(formatTimezoneOffset('basura')).toBe('');
    });
  });
});
