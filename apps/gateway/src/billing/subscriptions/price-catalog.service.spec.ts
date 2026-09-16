import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException, Logger } from '@nestjs/common';
import { SubscriptionPlan } from '@tesseract/types';
import { PriceCatalogService } from './price-catalog.service';
import { StripeClient } from './stripe.client';

/** Un `Price` de Stripe con `currency_options`, como lo devuelve la API ya expandido. */
const stripePrice = (
  id: string,
  lookupKey: string,
  usdMinor: number,
  mxnMinor?: number,
): Record<string, unknown> => ({
  id,
  lookup_key: lookupKey,
  currency: 'usd',
  unit_amount: usdMinor,
  currency_options: mxnMinor === undefined ? {} : { mxn: { unit_amount: mxnMinor } },
});

const FULL_CATALOG = [
  stripePrice('price_starter', 'starter_monthly', 2500, 49900),
  stripePrice('price_growth', 'growth_monthly', 7900, 159000),
  stripePrice('price_business', 'business_monthly', 19900, 399000),
  stripePrice('price_pro', 'pro_monthly', 49900, 999000),
  stripePrice('price_overage', 'overage_credit', 16, 320),
];

describe('PriceCatalogService', () => {
  let service: PriceCatalogService;
  let list: jest.Mock;

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    list = jest.fn().mockResolvedValue({ data: FULL_CATALOG });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PriceCatalogService,
        { provide: StripeClient, useValue: { stripe: { prices: { list } } } },
      ],
    }).compile();

    service = module.get(PriceCatalogService);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('consulta a Stripe', () => {
    it('pide todo el catálogo en una sola llamada, con currency_options expandido', async () => {
      await service.pricesFor(SubscriptionPlan.STARTER);

      expect(list).toHaveBeenCalledTimes(1);
      const args = list.mock.calls[0][0];
      expect(args.lookup_keys).toEqual([
        'starter_monthly',
        'growth_monthly',
        'business_monthly',
        'pro_monthly',
        'overage_credit',
        'credit_topup_unit',
      ]);
      expect(args.active).toBe(true);
      // Sin expandir, Stripe omite currency_options y los importes en pesos desaparecerían
      // en silencio: la página mostraría solo dólares y nadie se enteraría.
      expect(args.expand).toEqual(['data.currency_options']);
    });

    it('reutiliza la caché en llamadas posteriores', async () => {
      await service.priceIdFor(SubscriptionPlan.STARTER);
      await service.priceIdFor(SubscriptionPlan.PRO);
      await service.planFor('price_growth');

      expect(list).toHaveBeenCalledTimes(1);
    });

    it('no lanza N consultas cuando N peticiones llegan con la caché fría', async () => {
      await Promise.all([
        service.priceIdFor(SubscriptionPlan.STARTER),
        service.priceIdFor(SubscriptionPlan.GROWTH),
        service.priceIdFor(SubscriptionPlan.PRO),
      ]);

      expect(list).toHaveBeenCalledTimes(1);
    });

    it('vuelve a consultar tras invalidar', async () => {
      await service.priceIdFor(SubscriptionPlan.STARTER);
      service.invalidate();
      await service.priceIdFor(SubscriptionPlan.STARTER);

      expect(list).toHaveBeenCalledTimes(2);
    });
  });

  describe('resolución directa', () => {
    it('devuelve el Price ID del plan', async () => {
      expect(await service.priceIdFor(SubscriptionPlan.STARTER)).toBe('price_starter');
      expect(await service.priceIdFor(SubscriptionPlan.PRO)).toBe('price_pro');
    });

    it('aplana la moneda base y las currency_options en un solo mapa', async () => {
      expect(await service.pricesFor(SubscriptionPlan.STARTER)).toEqual({
        usd: 2500,
        mxn: 49900,
      });
    });

    it('lanza si el plan no se cobra por Stripe', async () => {
      // FREE y ENTERPRISE no tienen precio en el catálogo a propósito.
      await expect(service.priceIdFor(SubscriptionPlan.FREE)).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(service.priceIdFor(SubscriptionPlan.ENTERPRISE)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('lanza con un mensaje accionable si falta la lookup key en Stripe', async () => {
      list.mockResolvedValue({ data: [stripePrice('price_starter', 'starter_monthly', 2500)] });

      // El fallo tiene que señalar la causa: antes esto devolvía 'price_MISSING_CONFIG_PRO' y
      // Stripe respondía un error genérico que no mencionaba la configuración.
      await expect(service.priceIdFor(SubscriptionPlan.PRO)).rejects.toThrow(/pro_monthly/);
      await expect(service.priceIdFor(SubscriptionPlan.PRO)).rejects.toThrow(/sync-catalog/);
    });
  });

  describe('resolución inversa', () => {
    it('traduce Price ID a plan', async () => {
      expect(await service.planFor('price_starter')).toBe(SubscriptionPlan.STARTER);
      expect(await service.planFor('price_business')).toBe(SubscriptionPlan.BUSINESS);
    });

    it('resuelve igual sin importar la moneda del cobro', async () => {
      // currency_options añade importes al mismo objeto Price, así que una factura en pesos
      // trae exactamente el mismo identificador que una en dólares. Es lo que hace que la
      // atribución de un cobro a su plan no dependa nunca del importe.
      const price = FULL_CATALOG[0] as { id: string; currency_options: Record<string, unknown> };
      expect(price.currency_options.mxn).toBeDefined();
      expect(await service.planFor(price.id)).toBe(SubscriptionPlan.STARTER);
    });

    it('devuelve null para un precio que no es nuestro', async () => {
      expect(await service.planFor('price_de_otra_cuenta')).toBeNull();
    });

    it('no confunde el overage con un plan', async () => {
      expect(await service.planFor('price_overage')).toBeNull();
    });
  });

  describe('overage', () => {
    it('devuelve el precio por crédito de cada moneda', async () => {
      expect(await service.overageUnitAmount('usd')).toBe(16);
      expect(await service.overageUnitAmount('mxn')).toBe(320);
    });

    it('devuelve su Price ID', async () => {
      expect(await service.overagePriceId()).toBe('price_overage');
    });
  });
});
