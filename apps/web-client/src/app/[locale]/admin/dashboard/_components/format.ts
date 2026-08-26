/** Formato compartido de los widgets del dashboard de costos. */

/**
 * El costo real por ejecución suele estar muy por debajo de un centavo (el backend agrega con
 * hasta 6 decimales — ver `USD_DECIMALS` en `analytics.service.ts`); con solo 2 o 4 decimales un
 * agregado con poco volumen se aplasta a "$0.00" y parece un error en vez de un dato real.
 */
export function formatUSD(value: number): string {
  const abs = Math.abs(value);
  const maximumFractionDigits = abs === 0 ? 2 : abs < 0.01 ? 6 : abs < 10 ? 4 : 2;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits,
  }).format(value);
}

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', compactDisplay: 'short' }).format(value);
}

export function formatPct(value: number | null): string {
  if (value == null) return '—';
  return `${value.toFixed(1)}%`;
}
