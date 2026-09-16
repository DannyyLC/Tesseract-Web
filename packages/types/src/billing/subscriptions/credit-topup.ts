/**
 * Límites de la recarga de créditos de compra única.
 *
 * A diferencia de los paquetes fijos, el cliente elige cuántos créditos quiere: en Stripe es un
 * solo precio por crédito (`CREDIT_TOPUP_LOOKUP_KEY`) con `quantity` variable — el mismo
 * mecanismo que ya usa el overage. Estos límites son los que evitan los dos extremos: comprar
 * tan poco que la comisión de Stripe se coma la venta, o un dedazo con un cero de más.
 *
 * Viven en el paquete compartido porque el gateway los valida en el servidor (nunca confiar en
 * lo que mande el cliente) y el front los usa para el mismo formulario, con el mismo mensaje de
 * error en los dos lados.
 */
export const CREDIT_TOPUP_LIMITS = {
  min: 250,
  max: 25_000,
  step: 50,
} as const;

/** Atajos que ofrece la UI. Son solo sugerencias: cualquier cantidad válida dentro del rango se acepta igual. */
export const CREDIT_TOPUP_QUICK_AMOUNTS = [500, 1_000, 2_500, 5_000] as const;

export function isValidTopUpQuantity(credits: number): boolean {
  if (!Number.isInteger(credits)) return false;
  if (credits < CREDIT_TOPUP_LIMITS.min || credits > CREDIT_TOPUP_LIMITS.max) return false;
  return credits % CREDIT_TOPUP_LIMITS.step === 0;
}
