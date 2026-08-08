import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { SubscriptionPlan } from '@tesseract/types';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { StripeClient } from './stripe.client';
import { PriceCatalogService } from './price-catalog.service';
import { PrismaService } from '@/platform/database/prisma.service';
import { OrganizationsService } from '@/identity/organizations/organizations.service';
import { WebhookDedupService } from '@/platform/webhooks/webhook-dedup.service';

const mockBillingService = {
  handleWebhookEvent: jest.fn(),
  createCustomer: jest.fn(),
  createCheckoutSession: jest.fn(),
};

const mockPriceCatalog = {
  priceIdFor: jest.fn(),
  pricesFor: jest.fn(),
  overagePrices: jest.fn(),
};

const mockStripeClient = {
  stripe: {
    webhooks: { constructEvent: jest.fn() },
  },
};

const mockWebhookDedup = {
  claim: jest.fn(),
  release: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string) =>
    key === 'STRIPE_WEBHOOK_SECRET' ? 'whsec_test_123' : undefined,
  ),
};

const mockPrismaService = {
  subscription: { findUnique: jest.fn() },
  organization: { findUnique: jest.fn(), update: jest.fn() },
};
const mockOrganizationsService = {};

/** Petición mínima con el rawBody que exige la verificación de firma. */
const requestWithRawBody = (raw = '{"id":"evt_1"}') =>
  ({ rawBody: raw }) as unknown as Request;

const stripeEvent = { id: 'evt_1', type: 'invoice.payment_succeeded' };

describe('BillingController - Stripe webhook', () => {
  let controller: BillingController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BillingController],
      providers: [
        { provide: BillingService, useValue: mockBillingService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: StripeClient, useValue: mockStripeClient },
        { provide: PriceCatalogService, useValue: mockPriceCatalog },
        { provide: OrganizationsService, useValue: mockOrganizationsService },
        { provide: WebhookDedupService, useValue: mockWebhookDedup },
      ],
    }).compile();

    controller = module.get<BillingController>(BillingController);

    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.clearAllMocks();

    mockConfigService.get.mockImplementation((key: string) =>
      key === 'STRIPE_WEBHOOK_SECRET' ? 'whsec_test_123' : undefined,
    );
    mockStripeClient.stripe.webhooks.constructEvent.mockReturnValue(stripeEvent);
    mockWebhookDedup.claim.mockResolvedValue(true);
  });

  it('rechaza con 400 si falta el header de firma', async () => {
    await expect(controller.handleWebhook('', requestWithRawBody())).rejects.toThrow(
      BadRequestException,
    );
    expect(mockBillingService.handleWebhookEvent).not.toHaveBeenCalled();
  });

  it('rechaza con 400 si la firma es inválida', async () => {
    mockStripeClient.stripe.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature');
    });

    await expect(controller.handleWebhook('sig', requestWithRawBody())).rejects.toThrow(
      BadRequestException,
    );
    // Nunca se reclama el evento: una firma mala no debe consumir el id.
    expect(mockWebhookDedup.claim).not.toHaveBeenCalled();
    expect(mockBillingService.handleWebhookEvent).not.toHaveBeenCalled();
  });

  it('devuelve 500 si falta STRIPE_WEBHOOK_SECRET', async () => {
    mockConfigService.get.mockReturnValue(undefined);

    await expect(controller.handleWebhook('sig', requestWithRawBody())).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('procesa un evento nuevo y responde 200', async () => {
    mockBillingService.handleWebhookEvent.mockResolvedValue(undefined);

    const result = await controller.handleWebhook('sig', requestWithRawBody());

    expect(mockWebhookDedup.claim).toHaveBeenCalledWith(
      'stripe',
      'evt_1',
      'invoice.payment_succeeded',
    );
    expect(mockBillingService.handleWebhookEvent).toHaveBeenCalledWith(stripeEvent);
    expect(result).toEqual({ received: true });
  });

  it('omite un evento duplicado sin reprocesarlo', async () => {
    mockWebhookDedup.claim.mockResolvedValue(false);

    const result = await controller.handleWebhook('sig', requestWithRawBody());

    // Esta es la garantía que evita duplicar créditos ante un reintento.
    expect(mockBillingService.handleWebhookEvent).not.toHaveBeenCalled();
    expect(result).toEqual({ received: true, duplicate: true });
  });

  it('devuelve 503 y libera el claim si falla el procesamiento', async () => {
    mockBillingService.handleWebhookEvent.mockRejectedValue(new Error('DB connection lost'));

    await expect(controller.handleWebhook('sig', requestWithRawBody())).rejects.toThrow(
      ServiceUnavailableException,
    );

    // Liberar el claim es lo que permite que el reintento de Stripe sí procese.
    expect(mockWebhookDedup.release).toHaveBeenCalledWith('stripe', 'evt_1');
  });

  it('no responde 400 ante un fallo transitorio (Stripe deshabilitaría el endpoint)', async () => {
    mockBillingService.handleWebhookEvent.mockRejectedValue(new Error('timeout'));

    await expect(controller.handleWebhook('sig', requestWithRawBody())).rejects.not.toBeInstanceOf(
      BadRequestException,
    );
  });

  describe('checkout: país y moneda', () => {
    const request = {
      user: { sub: 'usr_1', organizationId: 'org_1', email: 'a@b.com', name: 'Ada', role: 'OWNER' },
    } as unknown as Parameters<BillingController['createCheckoutSession']>[0];

    /** Organización con Customer ya creado, para aislar lo que se está probando. */
    const organization = (country: string | null) => ({
      id: 'org_1',
      name: 'Acme',
      country,
      stripeCustomerId: 'cus_1',
    });

    beforeEach(() => {
      mockPrismaService.subscription.findUnique.mockResolvedValue(null);
      mockPriceCatalog.priceIdFor.mockResolvedValue('price_starter');
      mockBillingService.createCheckoutSession.mockResolvedValue('https://checkout.stripe.com/x');
    });

    it('usa el país guardado e ignora el del cuerpo', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValue(organization('MX'));

      await controller.createCheckoutSession(request, {
        plan: SubscriptionPlan.STARTER,
        country: 'US',
      });

      // Stripe congela la moneda del Customer en la primera factura: aceptar 'US' aquí solo
      // conseguiría que el checkout muestre dólares y el cobro salga en pesos.
      expect(mockBillingService.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({ currency: 'mxn' }),
      );
      expect(mockPrismaService.organization.update).not.toHaveBeenCalled();
    });

    it('acepta el país del cuerpo cuando la organización no tiene, y lo persiste', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValue(organization(null));

      await controller.createCheckoutSession(request, {
        plan: SubscriptionPlan.STARTER,
        country: 'MX',
      });

      expect(mockBillingService.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({ currency: 'mxn' }),
      );
      expect(mockPrismaService.organization.update).toHaveBeenCalledWith({
        where: { id: 'org_1' },
        data: { country: 'MX' },
      });
    });

    it('responde COUNTRY_REQUIRED si no hay país por ningún lado', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValue(organization(null));

      await expect(
        controller.createCheckoutSession(request, { plan: SubscriptionPlan.STARTER }),
      ).rejects.toThrow(BadRequestException);

      expect(mockBillingService.createCheckoutSession).not.toHaveBeenCalled();
      expect(mockPrismaService.organization.update).not.toHaveBeenCalled();
    });

    it('no escribe el país si Stripe falla al crear la sesión', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValue(organization(null));
      mockBillingService.createCheckoutSession.mockRejectedValue(new Error('Stripe caído'));

      await expect(
        controller.createCheckoutSession(request, {
          plan: SubscriptionPlan.STARTER,
          country: 'MX',
        }),
      ).rejects.toThrow('Stripe caído');

      // El campo no se puede corregir desde la aplicación, así que escribirlo antes de tener la
      // sesión dejaría a la organización anclada a una moneda que nunca llegó a usar.
      expect(mockPrismaService.organization.update).not.toHaveBeenCalled();
    });

    it('cobra en dólares a los países que no son México', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValue(organization('CO'));

      await controller.createCheckoutSession(request, { plan: SubscriptionPlan.STARTER });

      expect(mockBillingService.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({ currency: 'usd' }),
      );
    });
  });
});
