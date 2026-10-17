import { addDaysInZone, startOfDayInZone, zonedDayKey } from '@/platform/common/utils/zoned-dates';

/**
 * Proyección del saldo de créditos de una organización: cuándo se acaban a este ritmo.
 *
 * Estadística simple a propósito, sin modelos: el consumo de un cliente es bastante estable y lo
 * que más lo mueve es el día de la semana (un negocio que atiende de lunes a viernes casi no
 * gasta en fin de semana). Por eso, con historial suficiente, el ritmo esperado de cada día es
 * el promedio de ese mismo día de la semana en las últimas cuatro semanas.
 *
 * Función pura: recibe el consumo ya agrupado por día local y no toca la base, para poder
 * probarla con calendarios armados a mano.
 */

/** Días completos hacia atrás que se miran para estimar el ritmo. */
export const PROJECTION_WINDOW_DAYS = 28;
/** Con menos días de historial no hay base para estimar nada. */
export const MIN_HISTORY_DAYS = 3;
/** Desde aquí se usa el perfil por día de la semana (dos ocurrencias de cada día). */
export const WEEKDAY_MIN_HISTORY_DAYS = 14;
/** Hasta dónde se proyecta como máximo. */
export const PROJECTION_HORIZON_DAYS = 120;

export type ProjectionStatus =
  | 'insufficient_data'
  | 'no_consumption'
  | 'already_depleted'
  | 'depletes_before_renewal'
  | 'lasts_until_renewal'
  | 'depletes'
  | 'lasts_beyond_horizon';

export interface CreditProjectionInput {
  now: Date;
  timezone: string;
  balance: number;
  /** Créditos consumidos hoy (día local, parcial). */
  consumedToday: number;
  /** Consumo por día local (`YYYY-MM-DD`) de días completos anteriores a hoy. Días sin clave = 0. */
  dailyConsumption: Map<string, number>;
  /** Desde cuándo hay historial real: días anteriores no cuentan como "consumo cero". */
  historyStart: Date;
  /** Próxima renovación de créditos, o `null` si no hay una que se sepa que ocurrirá. */
  renewalDate: Date | null;
  /**
   * Sobregiro permitido: hasta cuántos créditos en negativo (-1 = sin tope). `null` o `0` = no
   * permitido (un tope de 0 es lo mismo que no tener sobregiro).
   */
  overageLimit: number | null;
}

export interface ProjectionPoint {
  /** Día local `YYYY-MM-DD`. */
  date: string;
  balance: number;
  low: number;
  high: number;
}

export interface CreditProjection {
  status: ProjectionStatus;
  method: 'weekday' | 'flat' | null;
  historyDays: number;
  /** Consumo esperado en un día promedio. */
  avgDailyConsumption: number;
  /** Día local en que el saldo llega a 0. */
  depletionDate: string | null;
  /**
   * Rango de `depletionDate` entre la semana más cargada y la más tranquila del historial.
   * `latest` es `null` si a ritmo de semana tranquila no se agotan (p. ej. hubo una semana sin
   * consumo): "a partir de `earliest`".
   */
  range: { earliest: string; latest: string | null } | null;
  /** Con sobregiro limitado: día en que se llegaría al tope. */
  overageLimitDate: string | null;
  renewalDate: string | null;
  /** Créditos que quedarían el día anterior a renovar. */
  leftoverAtRenewal: number | null;
  projected: ProjectionPoint[];
}

/** Día de la semana (0 = domingo) de una clave `YYYY-MM-DD`, sin pasar por la zona del proceso. */
function weekdayOf(dayKey: string): number {
  return new Date(`${dayKey}T00:00:00Z`).getUTCDay();
}

interface Simulation {
  balances: { date: string; balance: number }[];
  depletionDate: string | null;
  overageLimitDate: string | null;
  leftoverAtRenewal: number | null;
}

export function projectCredits(input: CreditProjectionInput): CreditProjection {
  const { now, timezone, balance, consumedToday, dailyConsumption } = input;
  const overageLimit = input.overageLimit === 0 ? null : input.overageLimit;
  const today = startOfDayInZone(now, timezone);
  const todayKey = zonedDayKey(today, timezone);
  const historyStartDay = startOfDayInZone(input.historyStart, timezone);
  const renewalKey = input.renewalDate ? zonedDayKey(input.renewalDate, timezone) : null;

  // Días completos de la ventana que caen dentro del historial real, del más viejo al más nuevo.
  const historyKeys: string[] = [];
  for (let back = PROJECTION_WINDOW_DAYS; back >= 1; back--) {
    const day = addDaysInZone(today, -back, timezone);
    if (day >= historyStartDay) historyKeys.push(zonedDayKey(day, timezone));
  }
  const consumptionOf = (key: string) => dailyConsumption.get(key) ?? 0;

  const base = {
    historyDays: historyKeys.length,
    depletionDate: null,
    range: null,
    overageLimitDate: null,
    renewalDate: renewalKey,
    leftoverAtRenewal: null,
    projected: [],
  };

  if (historyKeys.length < MIN_HISTORY_DAYS) {
    return { ...base, status: 'insufficient_data', method: null, avgDailyConsumption: 0 };
  }

  const method: 'weekday' | 'flat' =
    historyKeys.length >= WEEKDAY_MIN_HISTORY_DAYS ? 'weekday' : 'flat';

  // Ritmo esperado por día de la semana. Con `flat` los siete valen el promedio simple.
  const profile = new Array<number>(7).fill(0);
  if (method === 'weekday') {
    const sums = new Array<number>(7).fill(0);
    const counts = new Array<number>(7).fill(0);
    for (const key of historyKeys) {
      const weekday = weekdayOf(key);
      sums[weekday] += consumptionOf(key);
      counts[weekday] += 1;
    }
    for (let d = 0; d < 7; d++) profile[d] = counts[d] > 0 ? sums[d] / counts[d] : 0;
  } else {
    const mean = historyKeys.reduce((acc, key) => acc + consumptionOf(key), 0) / historyKeys.length;
    profile.fill(mean);
  }

  const avgDailyConsumption = profile.reduce((acc, value) => acc + value, 0) / 7;
  if (avgDailyConsumption <= 0) {
    return { ...base, status: 'no_consumption', method, avgDailyConsumption: 0 };
  }

  if (balance <= 0) {
    return {
      ...base,
      status: 'already_depleted',
      method,
      avgDailyConsumption,
      depletionDate: todayKey,
    };
  }

  /**
   * Resta día por día el consumo esperado (escalado por `factor`). Hoy solo cuenta lo que falta
   * por gastar del día. Se detiene al llegar al tope de sobregiro (o a 0 si no hay sobregiro),
   * un día antes de renovar, o en el horizonte.
   */
  const simulate = (factor: number): Simulation => {
    const result: Simulation = {
      balances: [],
      depletionDate: null,
      overageLimitDate: null,
      leftoverAtRenewal: null,
    };
    let current = balance;
    for (let offset = 0; offset < PROJECTION_HORIZON_DAYS; offset++) {
      const day = addDaysInZone(today, offset, timezone);
      const key = zonedDayKey(day, timezone);
      if (renewalKey && key >= renewalKey) {
        result.leftoverAtRenewal = current;
        break;
      }
      const expected = profile[weekdayOf(key)] * factor;
      current -= offset === 0 ? Math.max(0, expected - consumedToday) : expected;
      result.balances.push({ date: key, balance: current });

      if (result.depletionDate == null && current <= 0) {
        result.depletionDate = key;
        if (overageLimit == null) break;
      }
      if (overageLimit != null && overageLimit >= 0 && current <= -overageLimit) {
        result.overageLimitDate = key;
        break;
      }
    }
    return result;
  };

  const expected = simulate(1);

  // Factores de la semana más tranquila y la más cargada del historial completo disponible.
  let range: CreditProjection['range'] = null;
  let lowFactor = 1;
  let highFactor = 1;
  const fullWeeks = Math.floor(historyKeys.length / 7);
  if (method === 'weekday' && fullWeeks >= 2) {
    const recent = historyKeys.slice(historyKeys.length - fullWeeks * 7);
    const weekTotals = Array.from({ length: fullWeeks }, (_, w) =>
      recent.slice(w * 7, w * 7 + 7).reduce((acc, key) => acc + consumptionOf(key), 0),
    );
    const meanWeek = weekTotals.reduce((acc, total) => acc + total, 0) / fullWeeks;
    if (meanWeek > 0) {
      lowFactor = Math.min(...weekTotals) / meanWeek;
      highFactor = Math.max(...weekTotals) / meanWeek;
    }
  }
  const slow = simulate(lowFactor);
  const busy = simulate(highFactor);
  if (method === 'weekday' && expected.depletionDate) {
    range = {
      earliest: busy.depletionDate ?? expected.depletionDate,
      // Una semana tranquila puede no agotarse antes del horizonte o de renovar.
      latest: slow.depletionDate,
    };
  }

  // La gráfica cubre los días de la proyección esperada; la franja usa los mismos días.
  const balanceOn = (simulation: Simulation, index: number, fallback: number) =>
    simulation.balances[index]?.balance ?? fallback;
  const projected: ProjectionPoint[] = expected.balances.map((point, index) => ({
    date: point.date,
    balance: Math.round(point.balance),
    low: Math.round(balanceOn(busy, index, point.balance)),
    high: Math.round(balanceOn(slow, index, point.balance)),
  }));

  let status: ProjectionStatus;
  if (renewalKey) {
    status = expected.depletionDate ? 'depletes_before_renewal' : 'lasts_until_renewal';
  } else {
    status = expected.depletionDate ? 'depletes' : 'lasts_beyond_horizon';
  }

  return {
    status,
    method,
    historyDays: historyKeys.length,
    avgDailyConsumption: Math.round(avgDailyConsumption * 10) / 10,
    depletionDate: expected.depletionDate,
    range,
    overageLimitDate: expected.overageLimitDate,
    renewalDate: renewalKey,
    leftoverAtRenewal:
      status === 'lasts_until_renewal' && expected.leftoverAtRenewal != null
        ? Math.round(expected.leftoverAtRenewal)
        : null,
    projected,
  };
}
