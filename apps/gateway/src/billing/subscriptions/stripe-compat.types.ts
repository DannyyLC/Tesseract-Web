import Stripe from 'stripe';

/**
 * El cliente de Stripe está fijado en la API `2025-01-27.acacia` (ver stripe.client.ts), pero los
 * tipos del SDK instalado describen la API nueva. Estos tipos agregan, como opcionales, los campos
 * de la forma vieja que el código sigue leyendo (con fallback a la nueva), en lugar de `any`.
 */
export type LineItemCompat = Stripe.InvoiceLineItem & {
  /** API vieja: el precio viene aquí; en la nueva, en `pricing.price_details.price`. */
  price?: { id: string } | null;
};

export type InvoiceCompat = Omit<Stripe.Invoice, 'lines'> & {
  lines: Stripe.ApiList<LineItemCompat>;
  /** API vieja; en la nueva, `parent.subscription_details.subscription`. */
  subscription?: string | { id: string } | null;
  /** API vieja; en la nueva, `parent.subscription_details.metadata`. */
  subscription_details?: { metadata?: Stripe.Metadata | null } | null;
  /** API vieja: impuesto total en centavos; en la nueva, `total_taxes`. */
  tax?: number | null;
  /** API vieja; en la nueva, dentro de `payments`. Sin expandir es el id. */
  payment_intent?: string | null;
};

/** Lo que se lee del precio de una línea, sea de factura o de checkout, en cualquier API. */
export interface PricedLineCompat {
  pricing?: { price_details?: { price?: string | { id: string } } | null } | null;
  price?: { id: string } | null;
}

/** Id de algo que Stripe devuelve como id o como objeto expandido. */
export function stripeIdOf(value: string | { id: string } | null | undefined): string | undefined {
  if (!value) return undefined;
  return typeof value === 'string' ? value : value.id;
}

export type SubscriptionCompat = Stripe.Subscription & {
  /** API vieja; en la nueva, el periodo vive en cada item de la suscripción. */
  current_period_start: number;
  current_period_end: number;
};

/** Periodo actual de una suscripción (API vieja), en segundos Unix como lo manda Stripe. */
export function currentPeriodOf(subscription: Stripe.Subscription): { start: number; end: number } {
  const compat = subscription as SubscriptionCompat;
  return { start: compat.current_period_start, end: compat.current_period_end };
}

/** API vieja: `invoiceItems.create` todavía acepta `price` directo. */
export type InvoiceItemCreateParamsCompat = Stripe.InvoiceItemCreateParams & {
  price?: string;
};

/** Id del schedule de una suscripción, venga expandido o no. */
export function scheduleIdOf(subscription: Stripe.Subscription): string | undefined {
  return stripeIdOf(subscription.schedule);
}
