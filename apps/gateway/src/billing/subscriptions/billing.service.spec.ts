import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, Logger } from '@nestjs/common';
import { BillingService } from './billing.service';
import { StripeClient } from './stripe.client';
import { CreditsService } from '../credits/credits.service';
import { PrismaService } from '@/platform/database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { UtilityService } from '@/platform/utility/utility.service';

const mockStripeClient = {
  stripe: {
    paymentIntents: { list: jest.fn() },
    checkout: { sessions: { create: jest.fn() } },
    billingPortal: { sessions: { create: jest.fn() } },
    invoiceItems: { create: jest.fn() },
    subscriptions: {
      retrieve: jest.fn(),
      update: jest.fn(),
      list: jest.fn(),
      cancel: jest.fn(),
    },
    subscriptionSchedules: {
      create: jest.fn(),
      update: jest.fn(),
      release: jest.fn(),
    },
  },
  customers: {
    create: jest.fn(),
  },
};

const mockCreditsService = {
  addCredits: jest.fn(),
};

const mockPrismaService = {
  creditBalance: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  organization: {
    update: jest.fn(),
    findUnique: jest.fn(),
  },
  subscription: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
  },
  workflow: {
    count: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  apiKey: {
    count: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  user: {
    count: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  $transaction: jest.fn((promises) => Promise.all(promises || [])),
};

const mockConfigService = {
  get: jest.fn((key) => {
    const configMap: Record<string, string> = {
      STRIPE_PRICE_OVERAGE: 'price_overage_123',
      STRIPE_PRICE_PRO: 'price_pro_m_123',
      STRIPE_PRICE_ADVANCED: 'price_adv_m_123',
    };
    return configMap[key] || null;
  }),
};

const mockUtilityService = {
  sendNotificationToAppClients: jest.fn(),
};

describe('BillingService', () => {
  let service: BillingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: StripeClient, useValue: mockStripeClient },
        { provide: CreditsService, useValue: mockCreditsService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: UtilityService, useValue: mockUtilityService },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);

    // Mock logger to keep console clean during tests
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkConnection', () => {
    it('should return true if stripe connects successfully', async () => {
      mockStripeClient.stripe.paymentIntents.list.mockResolvedValue({});
      const result = await service.checkConnection();
      expect(result).toBe(true);
      expect(mockStripeClient.stripe.paymentIntents.list).toHaveBeenCalledWith({ limit: 1 });
    });

    it('should return false if stripe connection fails', async () => {
      mockStripeClient.stripe.paymentIntents.list.mockRejectedValue(new Error('Connection error'));
      const result = await service.checkConnection();
      expect(result).toBe(false);
    });
  });

  describe('createCustomer', () => {
    it('should create a customer and return its ID', async () => {
      mockStripeClient.customers.create.mockResolvedValue({ id: 'cus_123' });
      const dto = { email: 'test@test.com', name: 'Test User' };

      const result = await service.createCustomer(dto);

      expect(result).toBe('cus_123');
      expect(mockStripeClient.customers.create).toHaveBeenCalledWith({
        email: dto.email,
        name: dto.name,
        metadata: undefined,
      });
    });

    it('should throw out error if creation fails', async () => {
      mockStripeClient.customers.create.mockRejectedValue(new Error('Stripe error'));
      await expect(
        service.createCustomer({ email: 'test@test.com', name: 'Test User' }),
      ).rejects.toThrow('Stripe error');
    });
  });

  describe('createCheckoutSession', () => {
    it('should create a checkout session and return URL', async () => {
      mockStripeClient.stripe.checkout.sessions.create.mockResolvedValue({
        url: 'https://checkout.stripe.com/123',
      });

      const dto = {
        customerId: 'cus_123',
        priceId: 'price_123',
        successUrl: 'http://localhost/success',
        cancelUrl: 'http://localhost/cancel',
        metadata: { orgId: 'org-1' },
      };

      const result = await service.createCheckoutSession(dto);

      expect(result).toBe('https://checkout.stripe.com/123');
      expect(mockStripeClient.stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_123',
          mode: 'subscription',
          line_items: [{ price: 'price_123', quantity: 1 }],
          success_url: 'http://localhost/success',
          cancel_url: 'http://localhost/cancel',
          subscription_data: { metadata: { orgId: 'org-1' } },
          metadata: { orgId: 'org-1' },
        }),
      );
    });
  });

  describe('createCustomerPortalSession', () => {
    it('should create a portal session', async () => {
      mockStripeClient.stripe.billingPortal.sessions.create.mockResolvedValue({
        url: 'https://portal.stripe.com/123',
      });
      const result = await service.createCustomerPortalSession('cus_123', 'http://ret');

      expect(result).toBe('https://portal.stripe.com/123');
      expect(mockStripeClient.stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
        customer: 'cus_123',
        return_url: 'http://ret',
      });
    });
  });

  // ========== SUBSCRIPTION MANAGEMENT TESTS ==========
  describe('cancelSubscription', () => {
    it('should cancel subscription at period end and disable overages', async () => {
      mockPrismaService.subscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        stripeSubscriptionId: 'stripe-sub-1',
        plan: 'PRO',
      });

      await service.cancelSubscription('org-1');

      expect(mockStripeClient.stripe.subscriptions.update).toHaveBeenCalledWith('stripe-sub-1', {
        cancel_at_period_end: true,
      });
      expect(mockPrismaService.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { cancelAtPeriodEnd: true },
      });
      expect(mockPrismaService.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { allowOverages: false },
      });
    });

    it('should throw if no active subscription', async () => {
      mockPrismaService.subscription.findUnique.mockResolvedValue(null);
      await expect(service.cancelSubscription('org-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('resumeSubscription', () => {
    it('should resume subscription by disabling cancel_at_period_end', async () => {
      mockPrismaService.subscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        stripeSubscriptionId: 'stripe-sub-1',
      });

      await service.resumeSubscription('org-1');

      expect(mockStripeClient.stripe.subscriptions.update).toHaveBeenCalledWith('stripe-sub-1', {
        cancel_at_period_end: false,
      });
      expect(mockPrismaService.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { cancelAtPeriodEnd: false },
      });
    });
  });

  describe('changePlan', () => {
    const orgId = 'org-1';

    it('should throw if changing directly to FREE', async () => {
      await expect(service.changePlan(orgId, 'FREE')).rejects.toThrow(BadRequestException);
    });

    it('should throw if subscription is canceled', async () => {
      mockPrismaService.subscription.findUnique.mockResolvedValue({
        status: 'CANCELED',
        stripeSubscriptionId: 'sub_1',
      });
      await expect(service.changePlan(orgId, 'PRO')).rejects.toThrow(BadRequestException);
    });

    it('should throw if already on target plan', async () => {
      mockPrismaService.subscription.findUnique.mockResolvedValue({
        plan: 'PRO',
        stripeSubscriptionId: 'sub_1',
      });
      await expect(service.changePlan(orgId, 'PRO')).rejects.toThrow(BadRequestException);
    });

    it('should handle UPGRADE by immediate change', async () => {
      mockPrismaService.subscription.findUnique.mockResolvedValue({
        id: 'sub-db',
        plan: 'STANDARD',
        stripeSubscriptionId: 'sub_stripe_1',
      });

      mockStripeClient.stripe.subscriptions.retrieve.mockResolvedValue({
        status: 'active',
        items: { data: [{ id: 'item_1', price: { id: 'price_1' } }] },
      });

      await service.changePlan(orgId, 'PRO');

      // Verify update called with config mapped price ID
      expect(mockStripeClient.stripe.subscriptions.update).toHaveBeenCalledWith(
        'sub_stripe_1',
        expect.objectContaining({
          items: [{ id: 'item_1', price: 'price_pro_m_123' }],
          proration_behavior: 'none',
          billing_cycle_anchor: 'now',
        }),
      );
    });

    it('should handle DOWNGRADE by scheduling change', async () => {
      mockPrismaService.subscription.findUnique.mockResolvedValue({
        id: 'sub-db',
        plan: 'PRO',
        stripeSubscriptionId: 'sub_stripe_1',
      });

      mockStripeClient.stripe.subscriptions.retrieve.mockResolvedValue({
        status: 'active',
        current_period_start: 1000,
        current_period_end: 2000,
        items: { data: [{ id: 'item_1', price: { id: 'price_advanced' } }] },
      });

      mockStripeClient.stripe.subscriptionSchedules.create.mockResolvedValue({ id: 'sched_1' });

      // In plans.ts: ADVANCED is more expensive than STARTER (so it'll correctly trigger DOWNGRADE branch)
      await service.changePlan(orgId, 'STARTER');

      expect(mockStripeClient.stripe.subscriptionSchedules.create).toHaveBeenCalledWith({
        from_subscription: 'sub_stripe_1',
      });
      expect(mockStripeClient.stripe.subscriptionSchedules.update).toHaveBeenCalledWith(
        'sched_1',
        expect.objectContaining({
          phases: [
            {
              start_date: 1000,
              end_date: 2000,
              items: [{ price: 'price_advanced' }],
            },
            {
              start_date: 2000,
              items: [{ price: 'price_MISSING_CONFIG_STARTER' }],
            },
          ],
        }),
      );

      expect(mockPrismaService.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sub-db' },
          data: expect.objectContaining({ pendingPlanChange: 'STARTER' }),
        }),
      );
    });
  });

  describe('cancelPendingDowngrade', () => {
    it('should cancel the downgrade if schedule exists', async () => {
      mockPrismaService.subscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        stripeSubscriptionId: 'stripe_sub',
        pendingPlanChange: 'PRO',
      });

      mockStripeClient.stripe.subscriptions.retrieve.mockResolvedValue({
        schedule: 'sched_1',
      });

      await service.cancelPendingDowngrade('org-1');

      expect(mockStripeClient.stripe.subscriptionSchedules.release).toHaveBeenCalledWith('sched_1');
      expect(mockPrismaService.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: expect.objectContaining({ pendingPlanChange: null }),
      });
    });
  });

  describe('Webhook Events - Invoice Methods', () => {
    // We export private methods using index access for testing purposes

    it('handleInvoiceCreated - should bill overage if negative balance', async () => {
      const invoice = {
        id: 'inv_1',
        billing_reason: 'subscription_cycle',
        customer: 'cus_1',
        metadata: { organizationId: 'org-1' },
        subscription: 'sub_1',
      };

      mockPrismaService.creditBalance.findUnique.mockResolvedValue({ balance: -500 });

      // Call internal handler (mocking structure of webhook dispatch)
      await service.handleWebhookEvent({
        type: 'invoice.created',
        data: { object: invoice },
      } as any);

      expect(mockStripeClient.stripe.invoiceItems.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_1',
          invoice: 'inv_1',
          price: 'price_overage_123',
          quantity: 500,
        }),
      );

      expect(mockPrismaService.creditBalance.update).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        data: { invoicedOverageCredits: 500 },
      });
    });

    it('handleInvoicePaymentFailed - should revoke overages and update status', async () => {
      const invoice = {
        id: 'inv_1',
        metadata: { organizationId: 'org-1' },
        subscription: 'sub_1',
      };

      mockPrismaService.subscription.findUnique.mockResolvedValue({ id: 'sub-db' });

      await service.handleWebhookEvent({
        type: 'invoice.payment_failed',
        data: { object: invoice },
      } as any);

      expect(mockPrismaService.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { allowOverages: false },
      });
      expect(mockPrismaService.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-db' },
        data: { status: 'PAST_DUE' },
      });
    });
  });

  describe('Webhook Events - invoice.payment_succeeded', () => {
    // El plan PRO cuesta 499 USD e incluye 5000 créditos mensuales.
    const PRO_MONTHLY_CREDITS = 5000;

    /** Factura de renovación del plan PRO, resuelta por priceId de la línea. */
    const proInvoice = (overrides: Record<string, any> = {}) => ({
      id: 'inv_pro_1',
      customer: 'cus_1',
      amount_paid: 49900,
      metadata: { organizationId: 'org-1' },
      subscription: 'sub_1',
      lines: { data: [{ price: { id: 'price_pro_m_123' } }] },
      ...overrides,
    });

    /** Argumentos de addCredits: (orgId, monto, tipo, descripción, metadata, ...). */
    const addCreditsAmount = () => mockCreditsService.addCredits.mock.calls[0][1];

    beforeEach(() => {
      mockPrismaService.creditBalance.findUnique.mockResolvedValue({
        balance: 0,
        invoicedOverageCredits: 0,
      });
      mockPrismaService.subscription.findUnique.mockResolvedValue({ plan: 'PRO' });
      mockPrismaService.subscription.upsert.mockResolvedValue({ id: 'sub-db-1' });
      mockStripeClient.stripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_1',
        metadata: { organizationId: 'org-1' },
        items: { data: [{ current_period_start: 1700000000, current_period_end: 1702592000 }] },
      });
    });

    it('acredita los créditos del plan al pagarse la renovación', async () => {
      await service.handleWebhookEvent({
        type: 'invoice.payment_succeeded',
        data: { object: proInvoice() },
      } as any);

      expect(mockCreditsService.addCredits).toHaveBeenCalledWith(
        'org-1',
        PRO_MONTHLY_CREDITS,
        'SUBSCRIPTION_RENEWAL',
        expect.any(String),
        expect.objectContaining({ stripeInvoiceId: 'inv_pro_1' }),
        expect.any(Number),
        'sub-db-1',
        undefined,
      );
    });

    it('no acredita nada en facturas de $0 (inicio de trial)', async () => {
      await service.handleWebhookEvent({
        type: 'invoice.payment_succeeded',
        data: { object: proInvoice({ amount_paid: 0 }) },
      } as any);

      expect(mockCreditsService.addCredits).not.toHaveBeenCalled();
    });

    it('no acredita nada si la factura no trae suscripción', async () => {
      const invoice = proInvoice();
      delete (invoice as any).subscription;

      await service.handleWebhookEvent({
        type: 'invoice.payment_succeeded',
        data: { object: invoice },
      } as any);

      expect(mockCreditsService.addCredits).not.toHaveBeenCalled();
    });

    it('devuelve el overage ya facturado además de los créditos del plan', async () => {
      // Se facturaron 300 créditos de overage y el balance quedó en -300:
      // el pago los cubre, así que el saldo debe volver a los 5000 del plan.
      mockPrismaService.creditBalance.findUnique.mockResolvedValue({
        balance: -300,
        invoicedOverageCredits: 300,
      });

      await service.handleWebhookEvent({
        type: 'invoice.payment_succeeded',
        data: { object: proInvoice() },
      } as any);

      expect(addCreditsAmount()).toBe(PRO_MONTHLY_CREDITS + 300);

      // Y el snapshot de overage se limpia para el siguiente ciclo.
      expect(mockPrismaService.creditBalance.update).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        data: { invoicedOverageCredits: 0 },
      });
    });

    it('factura al mes siguiente el consumo que el pago no alcanzó a cubrir', async () => {
      // Balance -400 con solo 300 facturados deja un hueco de 100 créditos.
      mockPrismaService.creditBalance.findUnique.mockResolvedValue({
        balance: -400,
        invoicedOverageCredits: 300,
      });

      await service.handleWebhookEvent({
        type: 'invoice.payment_succeeded',
        data: { object: proInvoice() },
      } as any);

      expect(mockStripeClient.stripe.invoiceItems.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_1',
          price: 'price_overage_123',
          quantity: 100,
        }),
      );
    });

    it('resuelve el organizationId desde la suscripción de Stripe si falta en la factura', async () => {
      const invoice = proInvoice({ metadata: {} });

      await service.handleWebhookEvent({
        type: 'invoice.payment_succeeded',
        data: { object: invoice },
      } as any);

      expect(mockStripeClient.stripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_1');
      expect(mockCreditsService.addCredits).toHaveBeenCalledWith(
        'org-1',
        PRO_MONTHLY_CREDITS,
        'SUBSCRIPTION_RENEWAL',
        expect.any(String),
        expect.any(Object),
        expect.any(Number),
        'sub-db-1',
        undefined,
      );
    });
  });
});
