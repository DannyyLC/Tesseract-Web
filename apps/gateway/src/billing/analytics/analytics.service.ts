import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/platform/database/prisma.service';
import { addDaysInZone, startOfDayInZone, zonedDayKey } from '@/platform/common/utils/zoned-dates';
import { Prisma } from '@tesseract/database';
import { getPlanLimits, PlanPrices, SubscriptionPlan, WorkflowCategory } from '@tesseract/types';
import { PriceCatalogService } from '../subscriptions/price-catalog.service';
import { AdminAnalyticsOverviewResponseDto } from './dto/admin-analytics-overview-response.dto';
import { AdminAnalyticsTimeseriesResponseDto } from './dto/admin-analytics-timeseries-response.dto';
import {
  AdminAnalyticsTopWorkflowDto,
  AdminAnalyticsTopWorkflowsResponseDto,
} from './dto/admin-analytics-top-workflows-response.dto';
import {
  AdminAnalyticsOrganizationsMarginResponseDto,
  AdminAnalyticsOrgMarginRowDto,
} from './dto/admin-analytics-organizations-margin-response.dto';
import { AdminAnalyticsWorkflowResponseDto } from './dto/admin-analytics-workflow-response.dto';
import { AdminOrganizationsOverviewResponseDto } from './dto/admin-analytics-organizations-overview-response.dto';
import {
  ACTIVE_CUSTOMER_WHERE,
  CUSTOMER_WHERE,
  IDLE_DAYS,
  attentionReasons,
  segmentWhere,
} from '@/identity/organizations/admin-organization-segments';
import { toText } from '@/platform/common/utils/to-text';

/**
 * Zona fija de la plataforma, no por-organización. A diferencia de `ExecutionsService.getStats()`
 * (que resuelve la zona de la organización del cliente), este dashboard es para el equipo interno
 * — que opera desde México y toma decisiones de negocio en su propio horario — así que no tiene
 * sentido variarla por cada organización cliente que se agrega en la misma vista.
 */
const PLATFORM_TIMEZONE = 'America/Mexico_City';

/** Días hacia atrás desde hoy, sin contar hoy. `all` no recorta nada. */
const PERIOD_DAYS: Record<string, number> = { '24h': 0, '7d': 6, '30d': 29, '90d': 89 };

/** Precisión de los importes en USD: igual que `calculateCost()` en `llm-models.service.ts` — el
 * costo real por ejecución suele estar muy por debajo de un centavo, y redondear a menos
 * decimales lo aplastaría a $0.00 en agregados con poco volumen. */
const USD_DECIMALS = 6;

const CATEGORY_ORDER: WorkflowCategory[] = [
  WorkflowCategory.LIGHT,
  WorkflowCategory.STANDARD,
  WorkflowCategory.ADVANCED,
];

interface ByCategoryRawRow {
  category: string;
  organizationId: string;
  executions: number;
  costUSD: number;
  creditsCharged: number;
}

/** Cuántas ejecuciones más caras se listan en el detalle de un workflow. */
const TOP_EXECUTIONS_LIMIT = 10;

/** Rangos del histograma de costo por ejecución. */
const COST_BUCKETS = 10;

interface WorkflowSummaryRawRow {
  executions: number;
  completed: number;
  failed: number;
  charged: number;
  costUSD: number;
  creditsCharged: number;
  costAvg: number | null;
  costP50: number | null;
  costP95: number | null;
  costP99: number | null;
  costMax: number | null;
  inputAvg: number | null;
  inputP50: number | null;
  inputP95: number | null;
  inputMax: number | null;
  outputAvg: number | null;
  outputP50: number | null;
  outputP95: number | null;
  outputMax: number | null;
  inputTotal: number;
  outputTotal: number;
  durationAvg: number | null;
  durationP50: number | null;
  durationP95: number | null;
  durationMax: number | null;
}

interface WorkflowModelRawRow {
  model: string | null;
  executions: number;
  costUSD: number;
  inputTokens: number;
  outputTokens: number;
  estimated: boolean | null;
}

interface WorkflowDayRawRow {
  day: Date;
  executions: number;
  costUSD: number;
  creditsCharged: number;
  avgCostUSD: number | null;
  avgInputTokens: number | null;
  avgOutputTokens: number | null;
}

interface WorkflowTopExecutionRawRow {
  id: string;
  startedAt: Date;
  status: string;
  costUSD: number;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number | null;
  conversationId: string | null;
}

interface CreditValue {
  plan: SubscriptionPlan;
  /** USD por crédito, o `null` si no se puede resolver (plan sin precio en Stripe, ENTERPRISE sin config, etc.). */
  creditValueUSD: number | null;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Analítica de costos para el super admin: compara el costo real de ejecutar workflows (USD,
 * calculado sobre tokens de LLM) contra lo que se cobra en créditos y el valor monetario de esos
 * créditos según el plan de cada organización. No existe en ningún otro reporte — `getStats()` de
 * `ExecutionsService` agrupa créditos por categoría, pero es por una sola organización y no cruza
 * contra el costo real ni contra el valor del crédito.
 */
@Injectable()
export class AdminAnalyticsService {
  private readonly logger = new Logger(AdminAnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly priceCatalogService: PriceCatalogService,
  ) {}

  /** Corte a medianoche de `PLATFORM_TIMEZONE`, `days` días de calendario atrás. */
  private periodStartDate(period: string): Date | undefined {
    if (period === 'all') return undefined;
    const days = PERIOD_DAYS[period] ?? PERIOD_DAYS['30d'];
    return addDaysInZone(startOfDayInZone(new Date(), PLATFORM_TIMEZONE), -days, PLATFORM_TIMEZONE);
  }

  private baseWhere(startDate?: Date): Prisma.ExecutionWhereInput {
    return {
      deletedAt: null,
      isInternalWorkflow: false,
      ...(startDate && { startedAt: { gte: startDate } }),
    };
  }

  /**
   * Valor monetario (USD) de un crédito para cada organización dada.
   *
   * - Planes normales: precio de Stripe del plan / créditos mensuales del plan.
   *   `pricesFor()` nunca lanza: devuelve `{}` para planes sin Stripe (FREE), así que basta
   *   comprobar que `prices.usd` exista.
   * - FREE: 0 (no genera ingreso).
   * - ENTERPRISE: `Subscription.customMonthlyPrice / Subscription.customMonthlyCredits`.
   *   OJO: `customMonthlyPrice` está en dólares (`Decimal(19,4)`, se usa con `.toNumber()`
   *   directo en `organizations.service.ts`), no en centavos como los precios de Stripe.
   * - Cualquier dato faltante (`customMonthlyPrice`/`customMonthlyCredits` nulos, créditos en
   *   0 o -1, o plan sin precio en Stripe): `creditValueUSD: null`, nunca se divide por cero.
   */
  private async resolveCreditValues(orgIds: string[]): Promise<Map<string, CreditValue>> {
    if (orgIds.length === 0) return new Map();

    const organizations = await this.prisma.organization.findMany({
      where: { id: { in: orgIds } },
      select: {
        id: true,
        plan: true,
        subscription: { select: { customMonthlyPrice: true, customMonthlyCredits: true } },
      },
    });

    const planValueCache = new Map<SubscriptionPlan, number | null>();
    const result = new Map<string, CreditValue>();

    for (const org of organizations) {
      const plan = org.plan as SubscriptionPlan;

      if (plan === SubscriptionPlan.ENTERPRISE) {
        const customPrice = org.subscription?.customMonthlyPrice?.toNumber();
        const customCredits = org.subscription?.customMonthlyCredits;
        const value =
          customPrice && customCredits && customCredits > 0 ? customPrice / customCredits : null;
        result.set(org.id, { plan, creditValueUSD: value });
        continue;
      }

      if (!planValueCache.has(plan)) {
        planValueCache.set(plan, await this.resolvePlanCreditValueUSD(plan));
      }
      result.set(org.id, { plan, creditValueUSD: planValueCache.get(plan) ?? null });
    }

    return result;
  }

  private async resolvePlanCreditValueUSD(plan: SubscriptionPlan): Promise<number | null> {
    const monthlyCredits = getPlanLimits(plan).monthlyCredits;
    if (monthlyCredits <= 0) {
      // FREE: 0 créditos, 0 ingreso. Cualquier otro plan normal en 0/-1 sería un dato de
      // catálogo roto, así que se trata igual: sin ingreso resoluble.
      return plan === SubscriptionPlan.FREE ? 0 : null;
    }

    // `pricesFor()` no lanza cuando el plan simplemente no tiene lookup key (devuelve `{}`),
    // pero sí puede lanzar si la llamada a Stripe falla (API key inválida/ausente en este
    // entorno, Stripe caído, etc. — justo lo que pasa en local sin credenciales reales). El
    // dashboard de costos no debe caerse por eso: se trata igual que "sin precio resoluble".
    let prices: Awaited<ReturnType<PriceCatalogService['pricesFor']>>;
    try {
      prices = await this.priceCatalogService.pricesFor(plan);
    } catch (error) {
      this.logger.warn(
        `No se pudo consultar el precio de ${plan} en Stripe: se excluye del cálculo de margen. ${error instanceof Error ? error.message : toText(error)}`,
      );
      return null;
    }

    if (prices.usd === undefined) {
      this.logger.warn(`Plan ${plan} sin precio USD en Stripe: se excluye del cálculo de margen`);
      return null;
    }
    return prices.usd / 100 / monthlyCredits;
  }

  async getOverview(period: string): Promise<AdminAnalyticsOverviewResponseDto> {
    const startDate = this.periodStartDate(period);
    const where = this.baseWhere(startDate);

    const [grouped, overageExecutions, categoryRows] = await Promise.all([
      this.prisma.execution.groupBy({
        by: ['organizationId'],
        where,
        _sum: { cost: true, credits: true },
        _count: { _all: true },
      }),
      this.prisma.execution.count({ where: { ...where, wasOverage: true } }),
      this.prisma.$queryRaw<ByCategoryRawRow[]>`
        SELECT w.category AS category, e."organizationId" AS "organizationId",
               COUNT(*)::int AS executions,
               COALESCE(SUM(e.cost), 0)::float AS "costUSD",
               COALESCE(SUM(e.credits), 0)::int AS "creditsCharged"
        FROM executions e
        JOIN workflows w ON w.id = e."workflowId"
        WHERE e."deletedAt" IS NULL AND e."isInternalWorkflow" = false
          ${startDate ? Prisma.sql`AND e."startedAt" >= ${startDate}` : Prisma.empty}
        GROUP BY w.category, e."organizationId"
      `,
    ]);

    const orgIds = Array.from(
      new Set([
        ...grouped.map((g) => g.organizationId),
        ...categoryRows.map((r) => r.organizationId),
      ]),
    );
    const creditValues = await this.resolveCreditValues(orgIds);

    let totalExecutions = 0;
    let totalCostUSD = 0;
    let totalCreditsCharged = 0;
    let estimatedRevenueUSD = 0;
    let unpricedOrganizations = 0;

    for (const row of grouped) {
      const executions = row._count._all;
      const cost = row._sum.cost?.toNumber() ?? 0;
      const credits = row._sum.credits ?? 0;
      totalExecutions += executions;
      totalCostUSD += cost;
      totalCreditsCharged += credits;

      const creditValueUSD = creditValues.get(row.organizationId)?.creditValueUSD ?? null;
      if (creditValueUSD != null) {
        estimatedRevenueUSD += credits * creditValueUSD;
      } else {
        unpricedOrganizations += 1;
      }
    }

    const marginUSD = estimatedRevenueUSD - totalCostUSD;
    const marginPct = estimatedRevenueUSD > 0 ? (marginUSD / estimatedRevenueUSD) * 100 : null;
    const overageRate = totalExecutions > 0 ? (overageExecutions / totalExecutions) * 100 : 0;

    const byCategory = new Map(
      CATEGORY_ORDER.map((category) => [
        category,
        { category, executions: 0, costUSD: 0, creditsCharged: 0, estimatedRevenueUSD: 0 },
      ]),
    );

    for (const row of categoryRows) {
      const bucket = byCategory.get(row.category as WorkflowCategory);
      if (!bucket) continue; // categoría desconocida; no debería ocurrir con el enum actual
      bucket.executions += Number(row.executions);
      bucket.costUSD += Number(row.costUSD);
      bucket.creditsCharged += Number(row.creditsCharged);

      const creditValueUSD = creditValues.get(row.organizationId)?.creditValueUSD ?? null;
      if (creditValueUSD != null) {
        bucket.estimatedRevenueUSD += Number(row.creditsCharged) * creditValueUSD;
      }
    }

    return {
      period,
      timezone: PLATFORM_TIMEZONE,
      kpis: {
        activeOrganizations: grouped.length,
        totalExecutions,
        totalCostUSD: round(totalCostUSD, USD_DECIMALS),
        totalCreditsCharged,
        estimatedRevenueUSD: round(estimatedRevenueUSD, USD_DECIMALS),
        marginUSD: round(marginUSD, USD_DECIMALS),
        marginPct: marginPct != null ? round(marginPct, 2) : null,
        overageExecutions,
        overageRate: round(overageRate, 2),
        unpricedOrganizations,
      },
      byCategory: CATEGORY_ORDER.map((category) => {
        const bucket = byCategory.get(category);
        // Se inicializa una por categoría arriba; que falte sería un bug, no un dato.
        if (!bucket) throw new Error(`Sin acumulador para la categoría ${category}`);
        const bucketMarginUSD = bucket.estimatedRevenueUSD - bucket.costUSD;
        const bucketMarginPct =
          bucket.estimatedRevenueUSD > 0
            ? (bucketMarginUSD / bucket.estimatedRevenueUSD) * 100
            : null;
        return {
          category,
          executions: bucket.executions,
          costUSD: round(bucket.costUSD, USD_DECIMALS),
          creditsCharged: bucket.creditsCharged,
          estimatedRevenueUSD: round(bucket.estimatedRevenueUSD, USD_DECIMALS),
          marginUSD: round(bucketMarginUSD, USD_DECIMALS),
          marginPct: bucketMarginPct != null ? round(bucketMarginPct, 2) : null,
        };
      }),
    };
  }

  /**
   * Serie diaria de ejecuciones y costo, agregada en Postgres (no en Node): `executions` no
   * tiene política de retención y no escala traerse el periodo completo a memoria para un
   * agregado tan simple.
   */
  async getTimeseries(period: string): Promise<AdminAnalyticsTimeseriesResponseDto> {
    const startDate = this.periodStartDate(period) ?? new Date(0);

    // Doble `AT TIME ZONE`, no una: `startedAt` es `timestamp(3)` sin zona (el contenido es UTC,
    // pero el tipo no lo dice). El primero lo declara UTC; el segundo lo lleva a la zona de la
    // plataforma para truncar el día correcto — con uno solo, Postgres leería el valor como hora
    // local y el día quedaría desplazado el offset completo (seis u ocho horas en México).
    const rows = await this.prisma.$queryRaw<
      { day: Date; executions: number; costUSD: number; creditsCharged: number }[]
    >`
      SELECT (date_trunc('day', ("startedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${PLATFORM_TIMEZONE}))::date AS day,
             COUNT(*)::int AS executions,
             COALESCE(SUM(cost), 0)::float AS "costUSD",
             COALESCE(SUM(credits), 0)::int AS "creditsCharged"
      FROM executions
      WHERE "deletedAt" IS NULL AND "isInternalWorkflow" = false AND "startedAt" >= ${startDate}
      GROUP BY 1
      ORDER BY 1
    `;

    // `row.day` ya es la fecha de calendario en PLATFORM_TIMEZONE (el `::date` de Postgres la deja
    // sin zona); el driver la parsea a medianoche UTC de ese mismo día, así que basta leer el
    // Y-M-D en UTC — pasarla otra vez por `zonedDayKey` la convertiría dos veces y correría el día.
    const byDay = new Map(
      rows.map((row) => [
        row.day.toISOString().slice(0, 10),
        {
          executions: Number(row.executions),
          costUSD: Number(row.costUSD),
          creditsCharged: Number(row.creditsCharged),
        },
      ]),
    );

    // Días sin actividad rellenados con 0: un hueco en el eje justo donde no pasó nada sería
    // indistinguible de un error de carga. Se avanza por días de calendario de la plataforma, no
    // sumando 24h, para que un cambio de horario no desplace el resto de la serie.
    const points: AdminAnalyticsTimeseriesResponseDto['points'] = [];
    if (period !== 'all') {
      let cursor = startDate;
      const today = startOfDayInZone(new Date(), PLATFORM_TIMEZONE);
      while (cursor <= today) {
        const key = zonedDayKey(cursor, PLATFORM_TIMEZONE);
        const day = byDay.get(key);
        points.push({
          date: key,
          executions: day?.executions ?? 0,
          costUSD: round(day?.costUSD ?? 0, USD_DECIMALS),
          creditsCharged: day?.creditsCharged ?? 0,
        });
        cursor = addDaysInZone(cursor, 1, PLATFORM_TIMEZONE);
      }
    } else {
      for (const [date, day] of Array.from(byDay.entries()).sort(([a], [b]) =>
        a.localeCompare(b),
      )) {
        points.push({
          date,
          executions: day.executions,
          costUSD: round(day.costUSD, USD_DECIMALS),
          creditsCharged: day.creditsCharged,
        });
      }
    }

    return { period, timezone: PLATFORM_TIMEZONE, points };
  }

  async getTopWorkflows(
    period: string,
    metric: 'cost' | 'executions',
    limit: number,
  ): Promise<AdminAnalyticsTopWorkflowsResponseDto> {
    const startDate = this.periodStartDate(period);
    const where = this.baseWhere(startDate);

    const grouped = await this.prisma.execution.groupBy({
      by: ['workflowId'],
      where,
      _sum: { cost: true, credits: true },
      _count: { _all: true },
      // `_count.workflowId` en el orderBy (no `_all`, que aquí no es una clave válida para
      // ordenar) equivale a COUNT(*) igual: `workflowId` es la columna de agrupación, nunca nula.
      orderBy: metric === 'cost' ? { _sum: { cost: 'desc' } } : { _count: { workflowId: 'desc' } },
      take: limit,
    });

    const workflows = await this.prisma.workflow.findMany({
      where: { id: { in: grouped.map((g) => g.workflowId) } },
      select: {
        id: true,
        name: true,
        category: true,
        organizationId: true,
        organization: { select: { name: true } },
      },
    });
    const workflowById = new Map(workflows.map((w) => [w.id, w]));

    const items: AdminAnalyticsTopWorkflowDto[] = grouped
      .map((row) => {
        const workflow = workflowById.get(row.workflowId);
        if (!workflow) return null;
        return {
          workflowId: row.workflowId,
          workflowName: workflow.name,
          organizationId: workflow.organizationId,
          organizationName: workflow.organization.name,
          category: workflow.category as WorkflowCategory,
          executions: row._count._all,
          costUSD: round(row._sum.cost?.toNumber() ?? 0, USD_DECIMALS),
          creditsCharged: row._sum.credits ?? 0,
        };
      })
      .filter((item): item is AdminAnalyticsTopWorkflowDto => item !== null);

    return { metric, items };
  }

  async getOrganizationsMargin(
    period: string,
    page: number,
    limit: number,
    sortBy: 'marginPct' | 'costUSD' | 'executions',
  ): Promise<AdminAnalyticsOrganizationsMarginResponseDto> {
    const startDate = this.periodStartDate(period);
    const where = this.baseWhere(startDate);

    const grouped = await this.prisma.execution.groupBy({
      by: ['organizationId'],
      where,
      _sum: { cost: true, credits: true },
      _count: { _all: true },
    });

    const organizations = await this.prisma.organization.findMany({
      where: { id: { in: grouped.map((g) => g.organizationId) } },
      select: { id: true, name: true, plan: true },
    });
    const orgById = new Map(organizations.map((o) => [o.id, o]));
    const creditValues = await this.resolveCreditValues(grouped.map((g) => g.organizationId));

    const rows: AdminAnalyticsOrgMarginRowDto[] = grouped.map((row) => {
      const org = orgById.get(row.organizationId);
      const costUSD = row._sum.cost?.toNumber() ?? 0;
      const creditsCharged = row._sum.credits ?? 0;
      const creditValueUSD = creditValues.get(row.organizationId)?.creditValueUSD ?? null;
      const estimatedRevenueUSD = creditValueUSD != null ? creditsCharged * creditValueUSD : null;
      const marginUSD = estimatedRevenueUSD != null ? estimatedRevenueUSD - costUSD : null;
      const marginPct =
        marginUSD != null && estimatedRevenueUSD != null && estimatedRevenueUSD > 0
          ? (marginUSD / estimatedRevenueUSD) * 100
          : null;

      return {
        organizationId: row.organizationId,
        organizationName: org?.name ?? '(organización eliminada)',
        plan: (org?.plan as SubscriptionPlan) ?? SubscriptionPlan.FREE,
        executions: row._count._all,
        costUSD: round(costUSD, USD_DECIMALS),
        creditsCharged,
        estimatedRevenueUSD:
          estimatedRevenueUSD != null ? round(estimatedRevenueUSD, USD_DECIMALS) : null,
        marginUSD: marginUSD != null ? round(marginUSD, USD_DECIMALS) : null,
        marginPct: marginPct != null ? round(marginPct, 2) : null,
      };
    });

    // Los márgenes peores primero (ascendente) para saltar directo a los planes mal calibrados;
    // `null` (sin precio resoluble) al final, no se puede ordenar lo que no se puede comparar.
    rows.sort((a, b) => {
      if (sortBy === 'marginPct') {
        if (a.marginPct == null) return 1;
        if (b.marginPct == null) return -1;
        return a.marginPct - b.marginPct;
      }
      const key = sortBy;
      return b[key] - a[key];
    });

    const total = rows.length;
    const start = (page - 1) * limit;
    return { items: rows.slice(start, start + limit), page, limit, total };
  }

  /**
   * Números de arriba del listado de organizaciones: cuántas hay, cuánto ingreso recurrente
   * dejan, cuáles piden atención y cuáles dejaron de usar la plataforma. Los conteos usan los
   * mismos `where` que el filtro del listado (`admin-organization-segments.ts`), así que el
   * número de cada tarjeta coincide con lo que se ve al hacer clic en ella.
   */
  async getOrganizationsOverview(): Promise<AdminOrganizationsOverviewResponseDto> {
    const now = new Date();
    const reasons = attentionReasons(now);
    const count = (where: Prisma.OrganizationWhereInput) =>
      this.prisma.organization.count({ where });

    const [
      active,
      inactive,
      paying,
      free,
      attention,
      negativeBalance,
      lowCredits,
      paymentIssue,
      manualRenewalDue,
      idle,
      payingOrganizations,
    ] = await Promise.all([
      count(ACTIVE_CUSTOMER_WHERE),
      count({ ...CUSTOMER_WHERE, isActive: false }),
      count(segmentWhere('paying', now)),
      count(segmentWhere('free', now)),
      count(segmentWhere('attention', now)),
      count(reasons.negativeBalance),
      count(reasons.lowCredits),
      count(reasons.paymentIssue),
      count(reasons.manualRenewalDue),
      count(segmentWhere('idle', now)),
      this.prisma.organization.findMany({
        where: segmentWhere('paying', now),
        select: {
          plan: true,
          subscription: {
            select: {
              status: true,
              currency: true,
              customMonthlyPrice: true,
              stripeSubscriptionId: true,
            },
          },
        },
      }),
    ]);

    const mrr = { mxn: 0, usd: 0, priced: 0, unpriced: 0, manual: 0 };
    const planPrices = new Map<SubscriptionPlan, PlanPrices | null>();

    for (const org of payingOrganizations) {
      const subscription = org.subscription;
      // Un PAST_DUE sigue siendo ingreso recurrente (en riesgo, y por eso también sale en
      // "Requieren atención"); CANCELED o INCOMPLETE ya no lo son.
      if (!subscription || !['ACTIVE', 'PAST_DUE'].includes(subscription.status)) {
        mrr.unpriced += 1;
        continue;
      }

      const currency = subscription.currency.toLowerCase();
      if (currency !== 'mxn' && currency !== 'usd') {
        mrr.unpriced += 1;
        continue;
      }

      // El precio custom está en unidades de la moneda de la suscripción; el de Stripe, en
      // centavos.
      let amount = subscription.customMonthlyPrice?.toNumber() ?? null;
      if (amount == null) {
        const plan = org.plan as SubscriptionPlan;
        if (!planPrices.has(plan)) {
          try {
            planPrices.set(plan, await this.priceCatalogService.pricesFor(plan));
          } catch (error) {
            this.logger.warn(
              `No se pudo consultar el precio de ${plan} en Stripe: se excluye del MRR. ${error instanceof Error ? error.message : toText(error)}`,
            );
            planPrices.set(plan, null);
          }
        }
        const cents = planPrices.get(plan)?.[currency];
        amount = cents != null ? cents / 100 : null;
      }

      if (amount == null) {
        mrr.unpriced += 1;
        continue;
      }

      mrr[currency] += amount;
      mrr.priced += 1;
      if (!subscription.stripeSubscriptionId) mrr.manual += 1;
    }

    return {
      organizations: { active, inactive, paying, free },
      mrr: { ...mrr, mxn: round(mrr.mxn, 2), usd: round(mrr.usd, 2) },
      attention: {
        total: attention,
        negativeBalance,
        lowCredits,
        paymentIssue,
        manualRenewalDue,
      },
      idle: { total: idle, days: IDLE_DAYS },
    };
  }

  /**
   * Detalle de costo, tokens y margen de UN workflow, para explicar por qué dos workflows de la
   * misma categoría dejan márgenes distintos (los créditos son fijos por categoría; el costo no).
   *
   * Los tokens y la duración no viven en `executions` sino en el `metadata` de su
   * `CreditTransaction` (1:1 por `executionId`), que solo existe para las ejecuciones cobradas.
   * Por eso las estadísticas por ejecución (costo, tokens, duración) se calculan solo sobre esas;
   * las fallidas cuentan en volumen y tasa de éxito, pero no tienen de dónde sacar tokens.
   */
  async getWorkflowAnalytics(
    workflowId: string,
    period: string,
  ): Promise<AdminAnalyticsWorkflowResponseDto> {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      select: {
        id: true,
        name: true,
        category: true,
        organizationId: true,
        organization: { select: { name: true, plan: true } },
      },
    });
    if (!workflow) throw new NotFoundException(`Workflow ${workflowId} no encontrado`);

    const startDate = this.periodStartDate(period);
    const where = Prisma.sql`
      e."workflowId" = ${workflowId} AND e."deletedAt" IS NULL AND e."isInternalWorkflow" = false
      ${startDate ? Prisma.sql`AND e."startedAt" >= ${startDate}` : Prisma.empty}
    `;

    // `execution_time_ms` llega en 0 desde el flujo de streaming (no lo mide): se trata como
    // ausente y se cae a la diferencia entre `finishedAt` y `startedAt`.
    const durationMs = Prisma.sql`COALESCE(
      NULLIF((ct.metadata->>'execution_time_ms')::float, 0),
      EXTRACT(EPOCH FROM (e."finishedAt" - e."startedAt")) * 1000
    )`;

    const [[summary], modelRows, dayRows, topRows, creditValues] = await Promise.all([
      this.prisma.$queryRaw<WorkflowSummaryRawRow[]>`
        WITH ex AS (
          SELECT e.status::text AS status,
                 e.cost::float AS cost,
                 e.credits AS credits,
                 ct.id IS NOT NULL AS charged,
                 (ct.metadata->>'input_tokens')::float AS input_tokens,
                 (ct.metadata->>'output_tokens')::float AS output_tokens,
                 ${durationMs} AS duration_ms
          FROM executions e
          LEFT JOIN credit_transactions ct ON ct."executionId" = e.id
          WHERE ${where}
        )
        SELECT COUNT(*)::int AS executions,
               COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
               COUNT(*) FILTER (WHERE status IN ('FAILED', 'TIMEOUT'))::int AS failed,
               COUNT(*) FILTER (WHERE charged)::int AS charged,
               COALESCE(SUM(cost), 0)::float AS "costUSD",
               COALESCE(SUM(credits), 0)::int AS "creditsCharged",
               AVG(cost) FILTER (WHERE charged)::float AS "costAvg",
               (percentile_cont(0.5) WITHIN GROUP (ORDER BY cost) FILTER (WHERE charged))::float AS "costP50",
               (percentile_cont(0.95) WITHIN GROUP (ORDER BY cost) FILTER (WHERE charged))::float AS "costP95",
               (percentile_cont(0.99) WITHIN GROUP (ORDER BY cost) FILTER (WHERE charged))::float AS "costP99",
               (MAX(cost) FILTER (WHERE charged))::float AS "costMax",
               AVG(input_tokens) FILTER (WHERE charged)::float AS "inputAvg",
               (percentile_cont(0.5) WITHIN GROUP (ORDER BY input_tokens) FILTER (WHERE charged))::float AS "inputP50",
               (percentile_cont(0.95) WITHIN GROUP (ORDER BY input_tokens) FILTER (WHERE charged))::float AS "inputP95",
               (MAX(input_tokens) FILTER (WHERE charged))::float AS "inputMax",
               AVG(output_tokens) FILTER (WHERE charged)::float AS "outputAvg",
               (percentile_cont(0.5) WITHIN GROUP (ORDER BY output_tokens) FILTER (WHERE charged))::float AS "outputP50",
               (percentile_cont(0.95) WITHIN GROUP (ORDER BY output_tokens) FILTER (WHERE charged))::float AS "outputP95",
               (MAX(output_tokens) FILTER (WHERE charged))::float AS "outputMax",
               COALESCE(SUM(input_tokens) FILTER (WHERE charged), 0)::float AS "inputTotal",
               COALESCE(SUM(output_tokens) FILTER (WHERE charged), 0)::float AS "outputTotal",
               AVG(duration_ms) FILTER (WHERE charged)::float AS "durationAvg",
               (percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE charged))::float AS "durationP50",
               (percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE charged))::float AS "durationP95",
               (MAX(duration_ms) FILTER (WHERE charged))::float AS "durationMax"
        FROM ex
      `,
      // `cost_breakdown` trae una entrada por modelo con su costo; los tokens de ese modelo salen
      // de `usage_by_model`. Si `usage_by_model` viene vacío, el motor no reportó modelos y el
      // gateway costeó todo con el modelo por defecto: esa fila usa los tokens totales y se marca
      // como estimada.
      this.prisma.$queryRaw<WorkflowModelRawRow[]>`
        SELECT cb->>'model' AS model,
               COUNT(DISTINCT ct.id)::int AS executions,
               COALESCE(SUM((cb->>'cost')::float), 0)::float AS "costUSD",
               COALESCE(SUM(CASE
                 WHEN ct.metadata->'usage_by_model'->(cb->>'model') IS NOT NULL
                   THEN (ct.metadata->'usage_by_model'->(cb->>'model')->>'input_tokens')::float
                 WHEN COALESCE(ct.metadata->'usage_by_model', '{}'::jsonb) = '{}'::jsonb
                   THEN (ct.metadata->>'input_tokens')::float
                 ELSE 0 END), 0)::float AS "inputTokens",
               COALESCE(SUM(CASE
                 WHEN ct.metadata->'usage_by_model'->(cb->>'model') IS NOT NULL
                   THEN (ct.metadata->'usage_by_model'->(cb->>'model')->>'output_tokens')::float
                 WHEN COALESCE(ct.metadata->'usage_by_model', '{}'::jsonb) = '{}'::jsonb
                   THEN (ct.metadata->>'output_tokens')::float
                 ELSE 0 END), 0)::float AS "outputTokens",
               BOOL_OR(ct.metadata->'usage_by_model'->(cb->>'model') IS NULL) AS estimated
        FROM executions e
        JOIN credit_transactions ct ON ct."executionId" = e.id
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(ct.metadata->'cost_breakdown') = 'array'
               THEN ct.metadata->'cost_breakdown' ELSE '[]'::jsonb END
        ) AS cb
        WHERE ${where}
        GROUP BY 1
        ORDER BY "costUSD" DESC
      `,
      // Doble `AT TIME ZONE`: ver `getTimeseries()`.
      this.prisma.$queryRaw<WorkflowDayRawRow[]>`
        SELECT (date_trunc('day', (e."startedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${PLATFORM_TIMEZONE}))::date AS day,
               COUNT(*)::int AS executions,
               COALESCE(SUM(e.cost), 0)::float AS "costUSD",
               COALESCE(SUM(e.credits), 0)::int AS "creditsCharged",
               AVG(e.cost) FILTER (WHERE ct.id IS NOT NULL)::float AS "avgCostUSD",
               AVG((ct.metadata->>'input_tokens')::float)::float AS "avgInputTokens",
               AVG((ct.metadata->>'output_tokens')::float)::float AS "avgOutputTokens"
        FROM executions e
        LEFT JOIN credit_transactions ct ON ct."executionId" = e.id
        WHERE ${where}
        GROUP BY 1
        ORDER BY 1
      `,
      this.prisma.$queryRaw<WorkflowTopExecutionRawRow[]>`
        SELECT e.id AS id,
               e."startedAt" AS "startedAt",
               e.status::text AS status,
               e.cost::float AS "costUSD",
               (ct.metadata->>'input_tokens')::float AS "inputTokens",
               (ct.metadata->>'output_tokens')::float AS "outputTokens",
               ${durationMs}::float AS "durationMs",
               e."conversationId" AS "conversationId"
        FROM executions e
        LEFT JOIN credit_transactions ct ON ct."executionId" = e.id
        WHERE ${where}
        ORDER BY e.cost DESC, e."startedAt" DESC
        LIMIT ${TOP_EXECUTIONS_LIMIT}::int
      `,
      this.resolveCreditValues([workflow.organizationId]),
    ]);

    const creditValueUSD = creditValues.get(workflow.organizationId)?.creditValueUSD ?? null;
    const costUSD = Number(summary?.costUSD ?? 0);
    const creditsCharged = Number(summary?.creditsCharged ?? 0);
    const executions = Number(summary?.executions ?? 0);
    const estimatedRevenueUSD = creditValueUSD != null ? creditsCharged * creditValueUSD : null;
    const marginUSD = estimatedRevenueUSD != null ? estimatedRevenueUSD - costUSD : null;
    const marginPct =
      marginUSD != null && estimatedRevenueUSD != null && estimatedRevenueUSD > 0
        ? (marginUSD / estimatedRevenueUSD) * 100
        : null;
    const totalInputTokens = Number(summary?.inputTotal ?? 0);
    const totalOutputTokens = Number(summary?.outputTotal ?? 0);

    const totalModelCost = modelRows.reduce((acc, row) => acc + Number(row.costUSD), 0);

    // Fechas `::date`: se leen en UTC, no con `zonedDayKey` (ver `getTimeseries()`).
    const byDay = new Map(dayRows.map((row) => [row.day.toISOString().slice(0, 10), row]));
    const timeseries = this.dayKeys(period, startDate, Array.from(byDay.keys())).map((date) => {
      const day = byDay.get(date);
      const dayCredits = Number(day?.creditsCharged ?? 0);
      return {
        date,
        executions: Number(day?.executions ?? 0),
        costUSD: round(Number(day?.costUSD ?? 0), USD_DECIMALS),
        estimatedRevenueUSD:
          creditValueUSD != null ? round(dayCredits * creditValueUSD, USD_DECIMALS) : null,
        avgCostUSD: nullableRound(day?.avgCostUSD, USD_DECIMALS),
        avgInputTokens: nullableRound(day?.avgInputTokens, 0),
        avgOutputTokens: nullableRound(day?.avgOutputTokens, 0),
      };
    });

    return {
      period,
      timezone: PLATFORM_TIMEZONE,
      workflow: {
        id: workflow.id,
        name: workflow.name,
        category: workflow.category as WorkflowCategory,
        organizationId: workflow.organizationId,
        organizationName: workflow.organization.name,
        plan: workflow.organization.plan as SubscriptionPlan,
        creditValueUSD,
      },
      kpis: {
        executions,
        completed: Number(summary?.completed ?? 0),
        failed: Number(summary?.failed ?? 0),
        charged: Number(summary?.charged ?? 0),
        successRate:
          executions > 0 ? round((Number(summary?.completed ?? 0) / executions) * 100, 2) : 0,
        creditsCharged,
        costUSD: round(costUSD, USD_DECIMALS),
        estimatedRevenueUSD:
          estimatedRevenueUSD != null ? round(estimatedRevenueUSD, USD_DECIMALS) : null,
        marginUSD: marginUSD != null ? round(marginUSD, USD_DECIMALS) : null,
        marginPct: marginPct != null ? round(marginPct, 2) : null,
        costPerExecution: distribution(
          summary?.costAvg,
          summary?.costP50,
          summary?.costP95,
          summary?.costMax,
          USD_DECIMALS,
        ),
        inputTokens: distribution(
          summary?.inputAvg,
          summary?.inputP50,
          summary?.inputP95,
          summary?.inputMax,
          0,
        ),
        outputTokens: distribution(
          summary?.outputAvg,
          summary?.outputP50,
          summary?.outputP95,
          summary?.outputMax,
          0,
        ),
        totalInputTokens,
        totalOutputTokens,
        inputOutputRatio:
          totalOutputTokens > 0 ? round(totalInputTokens / totalOutputTokens, 2) : null,
        durationMs: distribution(
          summary?.durationAvg,
          summary?.durationP50,
          summary?.durationP95,
          summary?.durationMax,
          0,
        ),
      },
      byModel: modelRows.map((row) => ({
        model: row.model ?? '(sin modelo)',
        executions: Number(row.executions),
        inputTokens: Math.round(Number(row.inputTokens)),
        outputTokens: Math.round(Number(row.outputTokens)),
        costUSD: round(Number(row.costUSD), USD_DECIMALS),
        costSharePct:
          totalModelCost > 0 ? round((Number(row.costUSD) / totalModelCost) * 100, 2) : 0,
        estimated: Boolean(row.estimated),
      })),
      timeseries,
      costDistribution: await this.costDistribution(where, summary),
      topExecutions: topRows.map((row) => ({
        id: row.id,
        startedAt: row.startedAt.toISOString(),
        status: row.status,
        costUSD: round(Number(row.costUSD), USD_DECIMALS),
        inputTokens: nullableRound(row.inputTokens, 0),
        outputTokens: nullableRound(row.outputTokens, 0),
        durationMs: nullableRound(row.durationMs, 0),
        conversationId: row.conversationId,
      })),
    };
  }

  /**
   * Histograma del costo por ejecución en `COST_BUCKETS` rangos iguales entre 0 y el p99. Cortar en
   * el p99 y no en el máximo evita que una sola ejecución atípica aplaste todo lo demás en el
   * primer rango; lo que queda por encima cae en el último, que se reporta abierto (`toUSD: null`).
   */
  private async costDistribution(
    where: Prisma.Sql,
    summary: WorkflowSummaryRawRow | undefined,
  ): Promise<AdminAnalyticsWorkflowResponseDto['costDistribution']> {
    const upper = Number(summary?.costP99 ?? 0) || Number(summary?.costMax ?? 0);
    if (!summary || Number(summary.charged) === 0 || upper <= 0) return [];

    const rows = await this.prisma.$queryRaw<{ bucket: number; count: number }[]>`
      SELECT GREATEST(LEAST(width_bucket(e.cost::float, 0::float, ${upper}::float, ${COST_BUCKETS}::int), ${COST_BUCKETS}::int), 1)::int AS bucket,
             COUNT(*)::int AS count
      FROM executions e
      JOIN credit_transactions ct ON ct."executionId" = e.id
      WHERE ${where}
      GROUP BY 1
    `;
    const countByBucket = new Map(rows.map((row) => [Number(row.bucket), Number(row.count)]));
    const width = upper / COST_BUCKETS;

    return Array.from({ length: COST_BUCKETS }, (_, i) => ({
      fromUSD: round(width * i, USD_DECIMALS),
      toUSD: i === COST_BUCKETS - 1 ? null : round(width * (i + 1), USD_DECIMALS),
      count: countByBucket.get(i + 1) ?? 0,
    }));
  }

  /**
   * Claves de día (YYYY-MM-DD en `PLATFORM_TIMEZONE`) del periodo, para rellenar con 0 los días
   * sin actividad. Con `all` no hay inicio fijo: se usan solo los días que trajo la consulta.
   */
  private dayKeys(period: string, startDate: Date | undefined, present: string[]): string[] {
    if (period === 'all' || !startDate) return [...present].sort((a, b) => a.localeCompare(b));

    const keys: string[] = [];
    const today = startOfDayInZone(new Date(), PLATFORM_TIMEZONE);
    for (let cursor = startDate; cursor <= today; ) {
      keys.push(zonedDayKey(cursor, PLATFORM_TIMEZONE));
      cursor = addDaysInZone(cursor, 1, PLATFORM_TIMEZONE);
    }
    return keys;
  }
}

function nullableRound(value: number | null | undefined, decimals: number): number | null {
  return value == null ? null : round(Number(value), decimals);
}

function distribution(
  avg: number | null | undefined,
  p50: number | null | undefined,
  p95: number | null | undefined,
  max: number | null | undefined,
  decimals: number,
) {
  return {
    avg: nullableRound(avg, decimals),
    p50: nullableRound(p50, decimals),
    p95: nullableRound(p95, decimals),
    max: nullableRound(max, decimals),
  };
}
