import {
  addDaysInZone,
  addMonthsInZone,
  startOfDayInZone,
  startOfMonthInZone,
  startOfWeekInZone,
  zonedDayKey,
  zonedHourKey,
  zonedIsoWeekKey,
  zonedMonthKey,
} from './zoned-dates';

const CDMX = 'America/Mexico_City';

describe('zoned-dates', () => {
  // Estas pruebas son el guardarraíl del bug que motivó el módulo: agrupar en UTC
  // mientras el usuario lee en hora local movía un día entero de actividad.
  describe('agrupación en zona negativa', () => {
    // 02:00 UTC del día 6 son las 20:00 del día 5 en CDMX (UTC-6).
    const lateNight = new Date('2026-08-06T02:00:00Z');

    it('asigna la actividad nocturna al día local, no al UTC', () => {
      expect(zonedDayKey(lateNight, CDMX)).toBe('2026-08-05');
      expect(zonedDayKey(lateNight, 'UTC')).toBe('2026-08-06');
    });

    it('produce claves horarias en hora local', () => {
      expect(zonedHourKey(lateNight, CDMX)).toBe('2026-08-05 20:00:00');
    });

    it('alinea el inicio del día con la medianoche local', () => {
      expect(startOfDayInZone(lateNight, CDMX).toISOString()).toBe('2026-08-05T06:00:00.000Z');
    });

    it('calcula inicio de semana y de mes en local', () => {
      // 2026-08-05 es miércoles; su lunes es el 3.
      expect(zonedDayKey(startOfWeekInZone(lateNight, CDMX), CDMX)).toBe('2026-08-03');
      expect(zonedDayKey(startOfMonthInZone(lateNight, CDMX), CDMX)).toBe('2026-08-01');
      expect(zonedMonthKey(lateNight, CDMX)).toBe('2026-08');
    });
  });

  describe('aritmética de calendario', () => {
    const base = new Date('2026-08-06T02:00:00Z');

    it('suma y resta días cruzando el mes', () => {
      expect(zonedDayKey(addDaysInZone(base, 1, CDMX), CDMX)).toBe('2026-08-06');
      expect(zonedDayKey(addDaysInZone(base, -5, CDMX), CDMX)).toBe('2026-07-31');
    });

    it('suma meses apuntando al día 1', () => {
      expect(zonedDayKey(addMonthsInZone(base, 2, CDMX), CDMX)).toBe('2026-10-01');
    });

    it('mantiene la medianoche local al cruzar un cambio de horario', () => {
      // El 5 de abril de 2026 CDMX adelanta el reloj: ese día dura 23 horas, así que
      // sumar 86.400.000 ms dejaría la serie desplazada una hora a partir de ahí.
      const dstDay = new Date('2026-04-05T12:00:00Z');
      const next = addDaysInZone(dstDay, 1, CDMX);
      expect(zonedDayKey(next, CDMX)).toBe('2026-04-06');
      expect(zonedHourKey(next, CDMX)).toBe('2026-04-06 00:00:00');
    });
  });

  describe('semana ISO', () => {
    it('coincide con el formato IYYY-"W"IW de Postgres', () => {
      expect(zonedIsoWeekKey(new Date('2026-08-06T18:00:00Z'), CDMX)).toBe('2026-W32');
    });

    it('asigna el 1 de enero a la semana del año anterior cuando toca', () => {
      // 2027-01-01 cae en viernes, así que pertenece a la semana 53 de 2026.
      expect(zonedIsoWeekKey(new Date('2027-01-01T18:00:00Z'), CDMX)).toBe('2026-W53');
    });
  });
});
