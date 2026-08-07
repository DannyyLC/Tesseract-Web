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
});
