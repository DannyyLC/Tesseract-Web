import { addDaysInZone, startOfDayInZone, zonedDayKey } from '@/platform/common/utils/zoned-dates';
import { projectCredits, type CreditProjectionInput } from './credit-projection';

const TZ = 'America/Mexico_City';
// Miércoles 7 de octubre de 2026, mediodía en Ciudad de México.
const NOW = new Date('2026-10-07T18:00:00Z');
const TODAY = startOfDayInZone(NOW, TZ);

const dayKey = (offset: number) => zonedDayKey(addDaysInZone(TODAY, offset, TZ), TZ);
const weekday = (key: string) => new Date(`${key}T00:00:00Z`).getUTCDay();

/** Consumo de los últimos `days` días completos según `perDay(key)`. */
function history(days: number, perDay: (key: string) => number): Map<string, number> {
  const map = new Map<string, number>();
  for (let back = 1; back <= days; back++) map.set(dayKey(-back), perDay(dayKey(-back)));
  return map;
}

function input(overrides: Partial<CreditProjectionInput> = {}): CreditProjectionInput {
  return {
    now: NOW,
    timezone: TZ,
    balance: 1000,
    consumedToday: 0,
    dailyConsumption: history(28, () => 10),
    historyStart: addDaysInZone(TODAY, -60, TZ),
    renewalDate: null,
    overageLimit: null,
    ...overrides,
  };
}

describe('projectCredits', () => {
  it('sin historial suficiente no da fecha', () => {
    const result = projectCredits(
      input({ historyStart: addDaysInZone(TODAY, -2, TZ), dailyConsumption: history(2, () => 50) }),
    );
    expect(result.status).toBe('insufficient_data');
    expect(result.depletionDate).toBeNull();
  });

  it('sin consumo no da fecha', () => {
    const result = projectCredits(input({ dailyConsumption: new Map() }));
    expect(result.status).toBe('no_consumption');
  });

  it('con menos de 14 días usa promedio simple', () => {
    const result = projectCredits(
      input({
        balance: 100,
        historyStart: addDaysInZone(TODAY, -5, TZ),
        dailyConsumption: history(5, () => 20),
      }),
    );
    expect(result.method).toBe('flat');
    expect(result.avgDailyConsumption).toBe(20);
    // 100 créditos a 20 por día: hoy (sin consumo aún) baja a 80, …, se agota en el día 4.
    expect(result.depletionDate).toBe(dayKey(4));
    expect(result.range).toBeNull();
  });

  it('con historial largo respeta el día de la semana: los fines de semana no gastan', () => {
    const weekdaysOnly = history(28, (key) => ([0, 6].includes(weekday(key)) ? 0 : 10));
    const result = projectCredits(input({ balance: 45, dailyConsumption: weekdaysOnly }));

    expect(result.method).toBe('weekday');
    // Mié 10 → 35, jue 25, vie 15, sáb 15, dom 15, lun 5, mar -5: se agota el martes.
    expect(result.depletionDate).toBe(dayKey(6));
    expect(weekday(result.depletionDate!)).toBe(2);
  });

  it('descuenta de hoy lo que ya se consumió', () => {
    const result = projectCredits(input({ balance: 10, consumedToday: 10 }));
    // Hoy ya gastó lo esperado: el saldo de hoy no baja más y se agota mañana.
    expect(result.projected[0].balance).toBe(10);
    expect(result.depletionDate).toBe(dayKey(1));
  });

  it('se agota antes de renovar', () => {
    const result = projectCredits(
      input({ balance: 50, renewalDate: addDaysInZone(TODAY, 20, TZ) }),
    );
    expect(result.status).toBe('depletes_before_renewal');
    expect(result.depletionDate).toBe(dayKey(4));
  });

  it('alcanza hasta renovar y reporta lo que sobra', () => {
    const result = projectCredits(
      input({ balance: 1000, renewalDate: addDaysInZone(TODAY, 10, TZ) }),
    );
    expect(result.status).toBe('lasts_until_renewal');
    // 10 días de consumo (hoy incluido) a 10 por día.
    expect(result.leftoverAtRenewal).toBe(900);
    expect(result.depletionDate).toBeNull();
  });

  it('sin renovación (FREE o cancelada) proyecta hasta agotarse', () => {
    const result = projectCredits(input({ balance: 100 }));
    expect(result.status).toBe('depletes');
    expect(result.renewalDate).toBeNull();
  });

  it('con sobregiro limitado reporta cuándo llega al tope', () => {
    const result = projectCredits(input({ balance: 20, overageLimit: 30 }));
    expect(result.depletionDate).toBe(dayKey(1)); // 20 → 10 → 0
    expect(result.overageLimitDate).toBe(dayKey(4)); // … → -30
  });

  it('el rango ordena semana cargada antes que semana tranquila', () => {
    // Semanas de 5, 10, 15 y 20 por día: la más cargada adelanta la fecha.
    const varying = history(28, (key) => {
      for (let w = 0; w < 4; w++) {
        for (let d = 1; d <= 7; d++) if (dayKey(-(w * 7 + d)) === key) return 20 - w * 5;
      }
      return 0;
    });
    const result = projectCredits(input({ balance: 300, dailyConsumption: varying }));

    expect(result.range).not.toBeNull();
    expect(result.range!.earliest <= result.depletionDate!).toBe(true);
    expect(result.range!.latest! >= result.depletionDate!).toBe(true);
    expect(result.range!.earliest < result.range!.latest!).toBe(true);
  });

  it('saldo en cero o negativo: ya está agotado', () => {
    const result = projectCredits(input({ balance: 0 }));
    expect(result.status).toBe('already_depleted');
  });

  it('un tope de sobregiro de 0 es lo mismo que no tener sobregiro', () => {
    const result = projectCredits(input({ balance: 20, overageLimit: 0 }));
    expect(result.depletionDate).toBe(dayKey(1));
    expect(result.overageLimitDate).toBeNull();
  });

  it('si la semana más tranquila no gastó nada, el rango queda abierto ("a partir de")', () => {
    // Tres semanas a 20 por día y la más vieja en cero.
    const withIdleWeek = history(28, (key) => {
      for (let d = 22; d <= 28; d++) if (dayKey(-d) === key) return 0;
      return 20;
    });
    const result = projectCredits(input({ balance: 300, dailyConsumption: withIdleWeek }));

    expect(result.range).not.toBeNull();
    expect(result.range!.latest).toBeNull();
    expect(result.range!.earliest <= result.depletionDate!).toBe(true);
  });
});
