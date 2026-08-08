/**
 * Formato de importes de facturación.
 *
 * Todos los importes que cruzan la frontera con Stripe viajan en **unidades mínimas**
 * (centavos), que es como los entrega y los espera su API. La conversión a unidades mayores
 * ocurre en un solo lugar —aquí— para que no se repita el `/ 100` en cada componente, que es
 * donde acaban apareciendo los redondeos inconsistentes.
 */

import type { BillingCurrency } from '../platform/common/countries';

/**
 * Dígitos decimales de cada moneda soportada.
 *
 * USD y MXN tienen dos, pero no es universal: hay monedas sin decimales (JPY, CLP) donde el
 * factor es 1 y no 100. Se declara explícitamente para que añadir una de esas no se convierta
 * en un error silencioso de factor cien.
 */
const CURRENCY_DECIMALS: Record<BillingCurrency, number> = {
  usd: 2,
  mxn: 2,
};

/** Unidades mínimas → unidades mayores: `49900` en MXN → `499`. */
export function toMajorUnits(minorAmount: number, currency: BillingCurrency): number {
  return minorAmount / 10 ** CURRENCY_DECIMALS[currency];
}

/**
 * Importe listo para mostrar: `49900` + `mxn` → `$499.00`.
 *
 * Delega en `Intl.NumberFormat`, que coloca símbolo, separadores y posición según la
 * combinación de idioma y moneda. Escribir `$${amount}` a mano da resultados equivocados en
 * cuanto hay dos monedas en juego.
 */
export function formatMoney(
  minorAmount: number,
  currency: BillingCurrency,
  locale = 'es-MX',
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(toMajorUnits(minorAmount, currency));
}
