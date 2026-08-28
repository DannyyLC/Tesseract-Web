import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionPlan } from '@tesseract/types';
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
        { organizationId: 'org-free', _sum: { cost: decimal(5), credits: 100 }, _count: { _all: 20 } },
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
        { organizationId: 'org-starter', _sum: { cost: decimal(2), credits: 100 }, _count: { _all: 10 } },
      ]);
      mockPrismaService.organization.findMany.mockResolvedValue([
        { id: 'org-starter', name: 'Starter Co', plan: SubscriptionPlan.STARTER, subscription: null },
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
        { organizationId: 'org-unpriced', _sum: { cost: decimal(3), credits: 50 }, _count: { _all: 5 } },
      ]);
      mockPrismaService.organization.findMany.mockResolvedValue([
        { id: 'org-unpriced', name: 'Unpriced Co', plan: SubscriptionPlan.GROWTH, subscription: null },
      ]);
      mockPriceCatalogService.pricesFor.mockResolvedValue({}); // sin lookup key configurado

      const result = await service.getOrganizationsMargin('30d', 1, 20, 'marginPct');

      expect(result.items[0].estimatedRevenueUSD).toBeNull();
      expect(result.items[0].marginUSD).toBeNull();
      expect(result.items[0].marginPct).toBeNull();
    });

    it('Stripe inaccesible (API key inválida/caído): se excluye (null), no tumba la petición', async () => {
      mockPrismaService.execution.groupBy.mockResolvedValue([
        { organizationId: 'org-stripe-down', _sum: { cost: decimal(1), credits: 30 }, _count: { _all: 3 } },
      ]);
      mockPrismaService.organization.findMany.mockResolvedValue([
        { id: 'org-stripe-down', name: 'Stripe Down Co', plan: SubscriptionPlan.STARTER, subscription: null },
      ]);
      mockPriceCatalogService.pricesFor.mockRejectedValue(new Error('Invalid API Key provided: sk_test_...'));

      const result = await service.getOrganizationsMargin('30d', 1, 20, 'marginPct');

      expect(result.items[0].estimatedRevenueUSD).toBeNull();
      expect(result.items[0].marginUSD).toBeNull();
      expect(result.items[0].marginPct).toBeNull();
    });

    it('ENTERPRISE con precio y créditos custom: usa customMonthlyPrice en dólares, no en centavos', async () => {
      mockPrismaService.execution.groupBy.mockResolvedValue([
        { organizationId: 'org-ent', _sum: { cost: decimal(50), credits: 1000 }, _count: { _all: 40 } },
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
        { organizationId: 'org-ent-bare', _sum: { cost: decimal(10), credits: 200 }, _count: { _all: 8 } },
      ]);
      mockPrismaService.organization.findMany.mockResolvedValue([
        { id: 'org-ent-bare', name: 'Bare Enterprise', plan: SubscriptionPlan.ENTERPRISE, subscription: null },
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
});
