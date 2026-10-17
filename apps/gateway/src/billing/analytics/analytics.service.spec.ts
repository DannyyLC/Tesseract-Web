import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SubscriptionPlan, WorkflowCategory } from '@tesseract/types';
import { PrismaService } from '@/platform/database/prisma.service';
import { AdminAnalyticsService } from './analytics.service';
import { PriceCatalogService } from '../subscriptions/price-catalog.service';

// ─── Mock de PrismaService ─────────────────────────────────────────
const mockPrismaService = {
  execution: {
    groupBy: jest.fn(),
    count: jest.fn(),
  },
  organization: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  workflow: {
    findUnique: jest.fn(),
    count: jest.fn(),
  },
  $queryRaw: jest.fn(),
};

// ─── Mock de PriceCatalogService ────────────────────────────────────
const mockPriceCatalogService = {
  pricesFor: jest.fn(),
};

/** Decimal-like mínimo: solo lo que el servicio llama (`.toNumber()`). */
const decimal = (value: number) => ({ toNumber: () => value });

describe('AdminAnalyticsService', () => {
  let service: AdminAnalyticsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAnalyticsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: PriceCatalogService, useValue: mockPriceCatalogService },
      ],
    }).compile();

    service = module.get(AdminAnalyticsService);
    mockPrismaService.$queryRaw.mockResolvedValue([]);
    mockPrismaService.execution.count.mockResolvedValue(0);
  });

  describe('getOrganizationsMargin — valor del crédito', () => {
    it('FREE: valor del crédito es 0, no null — no genera ingreso pero sí es resoluble', async () => {
      mockPrismaService.execution.groupBy.mockResolvedValue([
        {
          organizationId: 'org-free',
          _sum: { cost: decimal(5), credits: 100 },
          _count: { _all: 20 },
        },
      ]);
      mockPrismaService.organization.findMany.mockResolvedValue([
        { id: 'org-free', name: 'Free Co', plan: SubscriptionPlan.FREE },
      ]);

      const result = await service.getOrganizationsMargin('30d', 1, 20, 'marginPct');

      expect(result.items).toHaveLength(1);
      expect(result.items[0].estimatedRevenueUSD).toBe(0);
      expect(result.items[0].marginUSD).toBe(-5); // 0 de ingreso - 5 de costo
      expect(result.items[0].marginPct).toBeNull(); // no se divide entre 0 de ingreso
    });

    it('plan pagado con precio en Stripe: convierte centavos/créditos a valor por crédito', async () => {
      mockPrismaService.execution.groupBy.mockResolvedValue([
        {
          organizationId: 'org-starter',
          _sum: { cost: decimal(2), credits: 100 },
          _count: { _all: 10 },
        },
      ]);
      mockPrismaService.organization.findMany.mockResolvedValue([
        {
          id: 'org-starter',
          name: 'Starter Co',
          plan: SubscriptionPlan.STARTER,
          subscription: null,
        },
      ]);
      // STARTER = 750 créditos/mes (packages/types/plans.ts). $75.00 -> 7500 centavos, elegido
      // para que el valor del crédito salga en 0.10 redondo y la aserción se lea sola.
      mockPriceCatalogService.pricesFor.mockResolvedValue({ usd: 7500 });

      const result = await service.getOrganizationsMargin('30d', 1, 20, 'marginPct');

      // valor del crédito = 7500/100/750 = 0.10 USD; 100 créditos cobrados = $10.00
      expect(result.items[0].estimatedRevenueUSD).toBeCloseTo(10);
      expect(result.items[0].marginUSD).toBeCloseTo(8); // 10 - 2
    });

    it('plan pagado sin precio en Stripe: se excluye (null), nunca divide por cero', async () => {
      mockPrismaService.execution.groupBy.mockResolvedValue([
        {
          organizationId: 'org-unpriced',
          _sum: { cost: decimal(3), credits: 50 },
          _count: { _all: 5 },
        },
      ]);
      mockPrismaService.organization.findMany.mockResolvedValue([
        {
          id: 'org-unpriced',
          name: 'Unpriced Co',
          plan: SubscriptionPlan.GROWTH,
          subscription: null,
        },
      ]);
      mockPriceCatalogService.pricesFor.mockResolvedValue({}); // sin lookup key configurado

      const result = await service.getOrganizationsMargin('30d', 1, 20, 'marginPct');

      expect(result.items[0].estimatedRevenueUSD).toBeNull();
      expect(result.items[0].marginUSD).toBeNull();
      expect(result.items[0].marginPct).toBeNull();
    });

    it('Stripe inaccesible (API key inválida/caído): se excluye (null), no tumba la petición', async () => {
      mockPrismaService.execution.groupBy.mockResolvedValue([
        {
          organizationId: 'org-stripe-down',
          _sum: { cost: decimal(1), credits: 30 },
          _count: { _all: 3 },
        },
      ]);
      mockPrismaService.organization.findMany.mockResolvedValue([
        {
          id: 'org-stripe-down',
          name: 'Stripe Down Co',
          plan: SubscriptionPlan.STARTER,
          subscription: null,
        },
      ]);
      mockPriceCatalogService.pricesFor.mockRejectedValue(
        new Error('Invalid API Key provided: sk_test_...'),
      );

      const result = await service.getOrganizationsMargin('30d', 1, 20, 'marginPct');

      expect(result.items[0].estimatedRevenueUSD).toBeNull();
      expect(result.items[0].marginUSD).toBeNull();
      expect(result.items[0].marginPct).toBeNull();
    });

    it('ENTERPRISE con precio y créditos custom: usa customMonthlyPrice en dólares, no en centavos', async () => {
      mockPrismaService.execution.groupBy.mockResolvedValue([
        {
          organizationId: 'org-ent',
          _sum: { cost: decimal(50), credits: 1000 },
          _count: { _all: 40 },
        },
      ]);
      mockPrismaService.organization.findMany.mockResolvedValue([
        {
          id: 'org-ent',
          name: 'Enterprise Co',
          plan: SubscriptionPlan.ENTERPRISE,
          subscription: { customMonthlyPrice: decimal(500), customMonthlyCredits: 5000 },
        },
      ]);

      const result = await service.getOrganizationsMargin('30d', 1, 20, 'marginPct');

      // valor del crédito = 500 / 5000 = 0.10 USD (500 son dólares, no centavos)
      expect(result.items[0].estimatedRevenueUSD).toBeCloseTo(100); // 1000 créditos * 0.10
      expect(mockPriceCatalogService.pricesFor).not.toHaveBeenCalled();
    });

    it('ENTERPRISE sin configuración custom: se excluye (null), no cae al catálogo de Stripe', async () => {
      mockPrismaService.execution.groupBy.mockResolvedValue([
        {
          organizationId: 'org-ent-bare',
          _sum: { cost: decimal(10), credits: 200 },
          _count: { _all: 8 },
        },
      ]);
      mockPrismaService.organization.findMany.mockResolvedValue([
        {
          id: 'org-ent-bare',
          name: 'Bare Enterprise',
          plan: SubscriptionPlan.ENTERPRISE,
          subscription: null,
        },
      ]);

      const result = await service.getOrganizationsMargin('30d', 1, 20, 'marginPct');

      expect(result.items[0].estimatedRevenueUSD).toBeNull();
      expect(mockPriceCatalogService.pricesFor).not.toHaveBeenCalled();
    });
  });

  describe('getOverview', () => {
    it('excluye organizaciones sin precio resoluble del ingreso pero las cuenta en unpricedOrganizations', async () => {
      mockPrismaService.execution.groupBy.mockResolvedValue([
        { organizationId: 'org-a', _sum: { cost: decimal(1), credits: 10 }, _count: { _all: 3 } },
        { organizationId: 'org-b', _sum: { cost: decimal(2), credits: 20 }, _count: { _all: 4 } },
      ]);
      mockPrismaService.organization.findMany.mockResolvedValue([
        { id: 'org-a', plan: SubscriptionPlan.FREE, subscription: null },
        { id: 'org-b', plan: SubscriptionPlan.GROWTH, subscription: null },
      ]);
      mockPriceCatalogService.pricesFor.mockResolvedValue({}); // GROWTH sin precio en este entorno

      const overview = await service.getOverview('30d');

      expect(overview.timezone).toBe('America/Mexico_City');
      expect(overview.kpis.totalExecutions).toBe(7);
      expect(overview.kpis.unpricedOrganizations).toBe(1); // org-b
      expect(overview.kpis.estimatedRevenueUSD).toBe(0); // org-a (FREE) aporta 0, org-b se excluye
      expect(overview.byCategory).toHaveLength(3); // LIGHT/STANDARD/ADVANCED siempre presentes
    });
  });

  describe('getWorkflowAnalytics', () => {
    const workflow = {
      id: 'wf-1',
      name: 'Asistente',
      category: WorkflowCategory.STANDARD,
      organizationId: 'org-1',
      organization: { name: 'Org Uno', plan: SubscriptionPlan.STARTER },
    };

    /** Fila resumen con todo en null/0; cada test sobreescribe solo lo que le importa. */
    const summaryRow = (overrides: Record<string, unknown> = {}) => ({
      executions: 0,
      completed: 0,
      failed: 0,
      charged: 0,
      costUSD: 0,
      creditsCharged: 0,
      costAvg: null,
      costP50: null,
      costP95: null,
      costP99: null,
      costMax: null,
      inputAvg: null,
      inputP50: null,
      inputP95: null,
      inputMax: null,
      outputAvg: null,
      outputP50: null,
      outputP95: null,
      outputMax: null,
      inputTotal: 0,
      outputTotal: 0,
      durationAvg: null,
      durationP50: null,
      durationP95: null,
      durationMax: null,
      ...overrides,
    });

    /** Orden de las consultas: resumen, modelos, serie diaria, top ejecuciones y, al final, el histograma. */
    const mockQueries = (
      summary: Record<string, unknown>,
      models: unknown[] = [],
      days: unknown[] = [],
      top: unknown[] = [],
      buckets: unknown[] = [],
    ) => {
      // `clearAllMocks` no vacía la cola de `Once`: si un test no llega al histograma, su respuesta
      // quedaría encolada para el siguiente. Se reinicia aquí.
      mockPrismaService.$queryRaw.mockReset();
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([summary])
        .mockResolvedValueOnce(models)
        .mockResolvedValueOnce(days)
        .mockResolvedValueOnce(top)
        .mockResolvedValueOnce(buckets);
    };

    beforeEach(() => {
      mockPrismaService.workflow.findUnique.mockResolvedValue(workflow);
      mockPrismaService.organization.findMany.mockResolvedValue([
        { id: 'org-1', plan: SubscriptionPlan.STARTER, subscription: null },
      ]);
      // STARTER = 750 créditos/mes; 7500 centavos -> 0.10 USD por crédito.
      mockPriceCatalogService.pricesFor.mockResolvedValue({ usd: 7500 });
    });

    it('workflow inexistente: 404', async () => {
      mockPrismaService.workflow.findUnique.mockResolvedValue(null);

      await expect(service.getWorkflowAnalytics('nope', '30d')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('calcula ingreso y margen con el valor del crédito del plan de la organización', async () => {
      mockQueries(
        summaryRow({
          executions: 4,
          completed: 3,
          failed: 1,
          charged: 3,
          costUSD: 0.3,
          creditsCharged: 15,
          inputTotal: 9000,
          outputTotal: 600,
        }),
      );

      const result = await service.getWorkflowAnalytics('wf-1', '30d');

      expect(result.workflow.creditValueUSD).toBeCloseTo(0.1);
      expect(result.kpis.estimatedRevenueUSD).toBeCloseTo(1.5); // 15 créditos × 0.10
      expect(result.kpis.marginUSD).toBeCloseTo(1.2); // 1.5 - 0.3
      expect(result.kpis.marginPct).toBeCloseTo(80);
      expect(result.kpis.successRate).toBe(75);
      expect(result.kpis.inputOutputRatio).toBe(15); // 9000 / 600
    });

    it('sin valor del crédito resoluble: ingreso y margen en null, nunca 0', async () => {
      mockPriceCatalogService.pricesFor.mockResolvedValue({});
      mockQueries(summaryRow({ executions: 2, charged: 2, costUSD: 0.2, creditsCharged: 10 }));

      const result = await service.getWorkflowAnalytics('wf-1', '30d');

      expect(result.kpis.estimatedRevenueUSD).toBeNull();
      expect(result.kpis.marginUSD).toBeNull();
      expect(result.kpis.marginPct).toBeNull();
      expect(result.timeseries.every((p) => p.estimatedRevenueUSD === null)).toBe(true);
    });

    it('marca como estimada la fila de modelo sin usage_by_model y reparte el % del costo', async () => {
      mockQueries(summaryRow({ executions: 3, charged: 3, costUSD: 0.4 }), [
        {
          model: 'claude-x',
          executions: 2,
          costUSD: 0.3,
          inputTokens: 100,
          outputTokens: 10,
          estimated: false,
        },
        {
          model: 'gpt-4o-mini',
          executions: 1,
          costUSD: 0.1,
          inputTokens: 50,
          outputTokens: 5,
          estimated: true,
        },
      ]);

      const result = await service.getWorkflowAnalytics('wf-1', '30d');

      expect(result.byModel.map((m) => m.estimated)).toEqual([false, true]);
      expect(result.byModel[0].costSharePct).toBe(75);
      expect(result.byModel[1].costSharePct).toBe(25);
    });

    it('histograma: 10 rangos hasta el p99, el último abierto; vacío sin ejecuciones cobradas', async () => {
      mockQueries(
        summaryRow({ executions: 5, charged: 5, costP99: 1, costMax: 3 }),
        [],
        [],
        [],
        [
          { bucket: 1, count: 3 },
          { bucket: 10, count: 2 },
        ],
      );

      const result = await service.getWorkflowAnalytics('wf-1', '30d');

      expect(result.costDistribution).toHaveLength(10);
      expect(result.costDistribution[0]).toEqual({ fromUSD: 0, toUSD: 0.1, count: 3 });
      expect(result.costDistribution[9]).toEqual({ fromUSD: 0.9, toUSD: null, count: 2 });

      mockQueries(summaryRow());
      const empty = await service.getWorkflowAnalytics('wf-1', '30d');
      expect(empty.costDistribution).toEqual([]);
    });

    it('rellena con 0 los días del periodo sin actividad', async () => {
      mockQueries(summaryRow());

      const result = await service.getWorkflowAnalytics('wf-1', '7d');

      expect(result.timeseries).toHaveLength(7); // hoy + 6 días atrás
      expect(result.timeseries.every((p) => p.executions === 0)).toBe(true);
    });
  });

  describe('getOrganizationsOverview — MRR', () => {
    const subscription = (overrides: Record<string, unknown> = {}) => ({
      status: 'ACTIVE',
      currency: 'mxn',
      customMonthlyPrice: null,
      stripeSubscriptionId: 'sub_123',
      ...overrides,
    });

    beforeEach(() => {
      mockPrismaService.organization.count.mockResolvedValue(0);
      // STARTER: 49900 centavos en MXN, 2500 en USD.
      mockPriceCatalogService.pricesFor.mockResolvedValue({ mxn: 49900, usd: 2500 });
    });

    it('suma por moneda: Stripe en centavos, precio custom en unidades, sin convertir monedas', async () => {
      mockPrismaService.organization.findMany.mockResolvedValue([
        { plan: SubscriptionPlan.STARTER, subscription: subscription() },
        { plan: SubscriptionPlan.STARTER, subscription: subscription({ currency: 'usd' }) },
        {
          plan: SubscriptionPlan.BUSINESS,
          subscription: subscription({
            customMonthlyPrice: decimal(3000),
            stripeSubscriptionId: null,
          }),
        },
      ]);

      const { mrr } = await service.getOrganizationsOverview();

      expect(mrr.mxn).toBe(499 + 3000);
      expect(mrr.usd).toBe(25);
      expect(mrr.priced).toBe(3);
      expect(mrr.manual).toBe(1);
      expect(mrr.unpriced).toBe(0);
    });

    it('sin suscripción vigente o sin precio resoluble: cuenta como unpriced, no suma 0', async () => {
      mockPriceCatalogService.pricesFor.mockResolvedValue({});
      mockPrismaService.organization.findMany.mockResolvedValue([
        { plan: SubscriptionPlan.GROWTH, subscription: null },
        { plan: SubscriptionPlan.GROWTH, subscription: subscription({ status: 'CANCELED' }) },
        { plan: SubscriptionPlan.GROWTH, subscription: subscription() }, // Stripe sin precio
      ]);

      const { mrr } = await service.getOrganizationsOverview();

      expect(mrr.unpriced).toBe(3);
      expect(mrr.priced).toBe(0);
      expect(mrr.mxn).toBe(0);
    });

    it('Stripe caído: excluye del MRR sin tumbar la petición', async () => {
      mockPriceCatalogService.pricesFor.mockRejectedValue(new Error('Stripe down'));
      mockPrismaService.organization.findMany.mockResolvedValue([
        { plan: SubscriptionPlan.STARTER, subscription: subscription() },
      ]);

      const { mrr } = await service.getOrganizationsOverview();

      expect(mrr.unpriced).toBe(1);
    });
  });

  describe('getWorkflowsOverview', () => {
    beforeEach(() => {
      mockPrismaService.workflow.count.mockResolvedValue(0);
      // STARTER: 7500 centavos / 750 créditos = 0.10 USD por crédito.
      mockPriceCatalogService.pricesFor.mockResolvedValue({ usd: 7500 });
      mockPrismaService.organization.findMany.mockResolvedValue([
        { id: 'org-paid', plan: SubscriptionPlan.STARTER, subscription: null },
        { id: 'org-free', plan: SubscriptionPlan.FREE, subscription: null },
      ]);
    });

    /** Orden de las consultas: fallas y después margen (las dos van en el mismo Promise.all). */
    const mockQueries = (failing: unknown[], margin: unknown[]) => {
      mockPrismaService.$queryRaw.mockReset();
      mockPrismaService.$queryRaw.mockResolvedValueOnce(failing).mockResolvedValueOnce(margin);
    };

    it('margen negativo: solo workflows que cuestan más de lo cobrado, con la pérdida sumada', async () => {
      mockQueries(
        [],
        [
          // 10 créditos × 0.10 = 1.00 cobrado; costó 1.50 → pierde 0.50.
          { id: 'wf-loss', organizationId: 'org-paid', costUSD: 1.5, credits: 10 },
          // Cobró 1.00 y costó 0.20 → deja margen.
          { id: 'wf-ok', organizationId: 'org-paid', costUSD: 0.2, credits: 10 },
        ],
      );

      const { negativeMargin } = await service.getWorkflowsOverview();

      expect(negativeMargin.total).toBe(1);
      expect(negativeMargin.lossUSD).toBeCloseTo(0.5);
    });

    it('margen negativo: excluye organizaciones FREE, donde todo lo que ejecutan es pérdida', async () => {
      mockQueries([], [{ id: 'wf-free', organizationId: 'org-free', costUSD: 3, credits: 0 }]);

      const { negativeMargin } = await service.getWorkflowsOverview();

      expect(negativeMargin.total).toBe(0);
    });

    it('con fallas: cuenta workflows y suma sus ejecuciones fallidas', async () => {
      mockQueries(
        [
          { id: 'wf-a', failed: 3 },
          { id: 'wf-b', failed: 2 },
        ],
        [],
      );

      const { failing } = await service.getWorkflowsOverview();

      expect(failing.total).toBe(2);
      expect(failing.failedExecutions).toBe(5);
      expect(failing.thresholdPct).toBe(10);
    });

    it('el filtro del listado usa los mismos ids que la tarjeta', async () => {
      mockPrismaService.$queryRaw.mockReset();
      mockPrismaService.$queryRaw.mockResolvedValueOnce([
        { id: 'wf-loss', organizationId: 'org-paid', costUSD: 5, credits: 1 },
      ]);

      const where = await service.resolveWorkflowSegment('negativeMargin');

      expect(where).toEqual({ id: { in: ['wf-loss'] } });
    });
  });
});
