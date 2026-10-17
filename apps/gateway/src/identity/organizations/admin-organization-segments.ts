import { Prisma } from '@tesseract/database';
import { PLANS, SubscriptionPlan } from '@tesseract/types';
import { PLATFORM_ORG_SLUG } from '@/platform/common/constants/platform-org.constant';

/**
 * Segmentos del listado de organizaciones del super admin.
 *
 * Viven aquí, y no en cada consumidor, porque los usan dos lugares que tienen que coincidir al
 * número: las tarjetas de arriba del listado (que cuentan) y el filtro del propio listado (que
 * muestra). Si cada uno escribiera su `where`, un clic en "Requieren atención: 3" podría
 * listar 2 o 4.
 *
 * Ninguno incluye la organización `platform` (la del super admin): no es un cliente.
 */
export const ADMIN_ORGANIZATION_SEGMENTS = ['paying', 'free', 'attention', 'idle'] as const;
export type AdminOrganizationSegment = (typeof ADMIN_ORGANIZATION_SEGMENTS)[number];

/** Saldo por debajo de esta fracción de los créditos mensuales del plan: hay que avisarle. */
export const LOW_CREDITS_RATIO = 0.1;

/** Una suscripción manual que vence en estos días o menos ya hay que renovarla a mano. */
export const MANUAL_RENEWAL_WINDOW_DAYS = 7;

/** Días sin ninguna ejecución para considerar que una organización dejó de usar la plataforma. */
export const IDLE_DAYS = 14;

const DAY_MS = 86_400_000;

/** Organización cliente viva: ni borrada ni la de plataforma. */
const customer: Prisma.OrganizationWhereInput = {
  deletedAt: null,
  slug: { not: PLATFORM_ORG_SLUG },
};

const activeCustomer: Prisma.OrganizationWhereInput = { ...customer, isActive: true };

/**
 * Motivos por los que una organización activa pide atención. Cada uno es un `where` aparte para
 * poder contarlos por separado; "Requieren atención" es su unión.
 */
export function attentionReasons(
  now: Date,
): Record<
  'negativeBalance' | 'lowCredits' | 'paymentIssue' | 'manualRenewalDue',
  Prisma.OrganizationWhereInput
> {
  // Umbral por plan: los créditos mensuales salen del catálogo, no de la base. ENTERPRISE
  // (créditos custom en la suscripción) y FREE (0 créditos) quedan fuera; su saldo negativo
  // sí lo detecta `negativeBalance`.
  const lowCreditsByPlan = Object.values(SubscriptionPlan)
    .map((plan) => ({ plan, monthly: PLANS[plan].limits.monthlyCredits }))
    .filter(({ monthly }) => monthly > 0)
    .map(({ plan, monthly }) => ({
      plan,
      creditBalance: {
        balance: { gte: 0, lt: Math.ceil(monthly * LOW_CREDITS_RATIO) },
      },
    }));

  return {
    negativeBalance: { ...activeCustomer, creditBalance: { balance: { lt: 0 } } },
    lowCredits: { ...activeCustomer, OR: lowCreditsByPlan },
    paymentIssue: {
      ...activeCustomer,
      subscription: { status: { in: ['PAST_DUE', 'INCOMPLETE'] } },
    },
    // Sin Stripe nadie la renueva solo: incluye las que ya vencieron y siguen en ACTIVE.
    manualRenewalDue: {
      ...activeCustomer,
      subscription: {
        stripeSubscriptionId: null,
        status: 'ACTIVE',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: { lte: new Date(now.getTime() + MANUAL_RENEWAL_WINDOW_DAYS * DAY_MS) },
      },
    },
  };
}

/**
 * Activa desde hace al menos `IDLE_DAYS` y sin ejecuciones de cliente en ese tiempo. Las
 * recién creadas se excluyen: que no hayan ejecutado nada es onboarding, no abandono.
 */
export function idleWhere(now: Date): Prisma.OrganizationWhereInput {
  const since = new Date(now.getTime() - IDLE_DAYS * DAY_MS);
  return {
    ...activeCustomer,
    createdAt: { lt: since },
    executions: {
      none: { startedAt: { gte: since }, deletedAt: null, isInternalWorkflow: false },
    },
  };
}

export function segmentWhere(
  segment: AdminOrganizationSegment,
  now: Date,
): Prisma.OrganizationWhereInput {
  switch (segment) {
    case 'paying':
      return { ...activeCustomer, plan: { not: 'FREE' } };
    case 'free':
      return { ...activeCustomer, plan: 'FREE' };
    case 'attention':
      return { OR: Object.values(attentionReasons(now)) };
    case 'idle':
      return idleWhere(now);
  }
}

export { activeCustomer as ACTIVE_CUSTOMER_WHERE, customer as CUSTOMER_WHERE };
