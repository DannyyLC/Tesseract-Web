import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/platform/database/prisma.service';
import { addDaysInZone, startOfDayInZone, zonedDayKey } from '@/platform/common/utils/zoned-dates';
import { Prisma } from '@tesseract/database';
import { getPlanLimits, SubscriptionPlan, WorkflowCategory } from '@tesseract/types';
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
        `No se pudo consultar el precio de ${plan} en Stripe: se excluye del cálculo de margen. ${error}`,
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
      new Set([...grouped.map((g) => g.organizationId), ...categoryRows.map((r) => r.organizationId)]),
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
        const bucket = byCategory.get(category)!;
        const bucketMarginUSD = bucket.estimatedRevenueUSD - bucket.costUSD;
        const bucketMarginPct =
          bucket.estimatedRevenueUSD > 0 ? (bucketMarginUSD / bucket.estimatedRevenueUSD) * 100 : null;
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
        { executions: Number(row.executions), costUSD: Number(row.costUSD), creditsCharged: Number(row.creditsCharged) },
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
      for (const [date, day] of Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b))) {
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
      orderBy:
        metric === 'cost' ? { _sum: { cost: 'desc' } } : { _count: { workflowId: 'desc' } },
      take: limit,
    });

    const workflows = await this.prisma.workflow.findMany({
      where: { id: { in: grouped.map((g) => g.workflowId) } },
      select: { id: true, name: true, category: true, organizationId: true, organization: { select: { name: true } } },
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
      const marginPct = marginUSD != null && estimatedRevenueUSD! > 0 ? (marginUSD / estimatedRevenueUSD!) * 100 : null;

      return {
        organizationId: row.organizationId,
        organizationName: org?.name ?? '(organización eliminada)',
        plan: (org?.plan as SubscriptionPlan) ?? SubscriptionPlan.FREE,
        executions: row._count._all,
        costUSD: round(costUSD, USD_DECIMALS),
        creditsCharged,
        estimatedRevenueUSD: estimatedRevenueUSD != null ? round(estimatedRevenueUSD, USD_DECIMALS) : null,
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
      const key = sortBy as 'costUSD' | 'executions';
      return b[key] - a[key];
    });

    const total = rows.length;
    const start = (page - 1) * limit;
    return { items: rows.slice(start, start + limit), page, limit, total };
  }
}
