/**
 * Nombres estables de los precios en Stripe.
 *
 * Sustituyen a las variables `STRIPE_PRICE_*`. La diferencia práctica es que un Price ID cambia
 * cada vez que se toca el importe —los `Price` de Stripe son inmutables en su precio— y una
 * lookup key no: al crear el precio nuevo la clave se muda con `transfer_lookup_key` y el
 * código sigue pidiendo lo mismo. Eso convierte un cambio de precio en correr un script, sin
 * redeploy ni variables que actualizar, y hace que los entornos de prueba y producción
 * compartan el mismo código aunque sus Price IDs sean distintos.
 *
 * Viven en el paquete compartido porque tienen dos consumidores que no pueden importarse entre
 * sí: el gateway, que los resuelve en runtime, y `scripts/stripe/sync-catalog.ts`, que los
 * escribe en Stripe. Con dos copias, la primera errata de dedo pasaría inadvertida hasta que
 * un checkout fallara en producción.
 */

import { SubscriptionPlan } from './plans';

export const PLAN_LOOKUP_KEYS: Partial<Record<SubscriptionPlan, string>> = {
  [SubscriptionPlan.STARTER]: 'starter_monthly',
  [SubscriptionPlan.GROWTH]: 'growth_monthly',
  [SubscriptionPlan.BUSINESS]: 'business_monthly',
  [SubscriptionPlan.PRO]: 'pro_monthly',
};

/**
 * El overage no es un plan: es un precio por crédito de pago único que se adjunta como línea a
 * la factura del mes en que hubo consumo por encima del saldo.
 */
export const OVERAGE_LOOKUP_KEY = 'overage_credit';

/**
 * Precio por crédito de la recarga de compra única (cantidad libre, no paquetes fijos). Pago
 * único cobrado de inmediato vía Checkout `mode: 'payment'`, a diferencia del overage, que se
 * adjunta a la factura del ciclo. Ver `CREDIT_TOPUP_LIMITS` para el rango permitido.
 */
export const CREDIT_TOPUP_LOOKUP_KEY = 'credit_topup_unit';

/**
 * Planes que se cobran por Stripe. `FREE` no cobra y `ENTERPRISE` se negocia por
 * `Subscription.customMonthlyPrice`, así que ninguno de los dos tiene precio en el catálogo.
 */
export const BILLABLE_PLANS = Object.keys(PLAN_LOOKUP_KEYS) as SubscriptionPlan[];

/** Todo lo que hay que resolver contra Stripe, para pedirlo en una sola consulta. */
export const ALL_LOOKUP_KEYS: string[] = [
  ...Object.values(PLAN_LOOKUP_KEYS),
  OVERAGE_LOOKUP_KEY,
  CREDIT_TOPUP_LOOKUP_KEY,
];
