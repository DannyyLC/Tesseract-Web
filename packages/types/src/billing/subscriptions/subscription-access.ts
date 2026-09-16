/**
 * Regla única de "¿puede esta organización consumir infraestructura ahora mismo?".
 *
 * Los créditos **no caducan**: el saldo se conserva indefinidamente. Lo que decide si se puede
 * gastar es la suscripción, no el saldo — un cliente cancelado con saldo a favor no debe poder
 * seguir ejecutando workflows, porque cada ejecución cuesta Cloud Run/Cloud SQL aunque el saldo
 * ya esté pagado.
 *
 * Vive en el paquete compartido porque la usan tanto `CreditsService.canExecuteWorkflow`
 * (gateway) como, potencialmente, cualquier otra verificación de acceso que necesite el mismo
 * criterio sin reimplementarlo.
 */

/** Días de gracia tras el primer cobro fallido antes de bloquear la ejecución. */
export const PAST_DUE_GRACE_DAYS = 7;

export type SubscriptionDenialReason =
  | 'NO_SUBSCRIPTION'
  | 'SUBSCRIPTION_CANCELED'
  | 'SUBSCRIPTION_PAST_DUE';

export interface SubscriptionAccessInput {
  /**
   * `null` cuando la organización no tiene fila `Subscription` (p.ej. nunca contrató).
   *
   * Tipado como `string` a propósito y no como el enum `SubscriptionStatus` de este mismo
   * paquete: quien llama normalmente trae el `SubscriptionStatus` que genera Prisma
   * (`@tesseract/database`), y dos `enum` de TypeScript con los mismos miembros siguen siendo
   * tipos nominalmente distintos — el de Prisma no sería asignable aquí sin este relajamiento.
   * Los valores reales ('ACTIVE', 'CANCELED', 'PAST_DUE', 'INCOMPLETE') son los mismos en ambos.
   */
  status: string | null;
  /**
   * Cuándo falló el primer cobro del impago actual. `null` mientras está al corriente.
   * Se limpia en cuanto vuelve a estar `ACTIVE`, así que un segundo impago reinicia el reloj.
   */
  pastDueSince: Date | null;
}

export type SubscriptionAccessResult =
  | { allowed: true }
  | { allowed: false; reason: SubscriptionDenialReason };

/**
 * Resuelve si la organización puede ejecutar workflows en este momento.
 *
 * `ACTIVE` permite siempre — incluye a quien canceló pero sigue dentro de su periodo ya pagado
 * (`cancelAtPeriodEnd: true`), porque Stripe mantiene el status en `active` hasta que el periodo
 * vence y solo entonces manda `customer.subscription.deleted`.
 *
 * `PAST_DUE` permite solo dentro de los `PAST_DUE_GRACE_DAYS` desde `pastDueSince`. Es un reloj
 * propio, más corto y separado del de Stripe (que reintenta el cobro durante semanas): no
 * esperamos a que Stripe se rinda para dejar de gastar infraestructura en un cobro que ya falló.
 *
 * `CANCELED`, `INCOMPLETE` y sin fila de suscripción deniegan siempre, sin importar el saldo.
 */
export function resolveSubscriptionAccess(
  input: SubscriptionAccessInput,
  now: Date = new Date(),
): SubscriptionAccessResult {
  if (input.status === null) {
    return { allowed: false, reason: 'NO_SUBSCRIPTION' };
  }

  if (input.status === 'ACTIVE') {
    return { allowed: true };
  }

  if (input.status === 'PAST_DUE') {
    if (!input.pastDueSince) {
      // No debería pasar (handleInvoicePaymentFailed siempre lo marca), pero sin fecha no hay
      // gracia que conceder: se deniega en vez de asumir que acaba de fallar.
      return { allowed: false, reason: 'SUBSCRIPTION_PAST_DUE' };
    }

    const graceMs = PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000;
    const withinGrace = now.getTime() - input.pastDueSince.getTime() <= graceMs;

    return withinGrace ? { allowed: true } : { allowed: false, reason: 'SUBSCRIPTION_PAST_DUE' };
  }

  // CANCELED, INCOMPLETE
  return { allowed: false, reason: 'SUBSCRIPTION_CANCELED' };
}
