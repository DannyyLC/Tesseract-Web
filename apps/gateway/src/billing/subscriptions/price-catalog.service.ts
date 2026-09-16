import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import {
  ALL_LOOKUP_KEYS,
  BillingCurrency,
  CREDIT_TOPUP_LOOKUP_KEY,
  OVERAGE_LOOKUP_KEY,
  PLAN_LOOKUP_KEYS,
  PlanPrices,
  SubscriptionPlan,
} from '@tesseract/types';
import { StripeClient } from './stripe.client';

/** Un precio del catálogo, ya normalizado. */
export interface CatalogPrice {
  /** Price ID de Stripe. Es el mismo para todas las monedas del precio. */
  id: string;
  /** Importes por moneda, en unidades mínimas. */
  prices: PlanPrices;
}

interface Catalog {
  /** lookup key → precio */
  byLookupKey: Map<string, CatalogPrice>;
  /** Price ID → plan. Sin entrada para el overage, que no es un plan. */
  planByPriceId: Map<string, SubscriptionPlan>;
}

/**
 * Cuánto se reutiliza el catálogo antes de volver a preguntarle a Stripe.
 *
 * Cinco minutos porque los precios cambian de higos a brevas y el endpoint que más lo consulta
 * (`GET /billing/plans`) es público y sin autenticar: sin caché, cualquiera podría convertir
 * una visita a la página de precios en una llamada a la API de Stripe. Quedar desactualizado
 * unos minutos tras un cambio de precio no le hace daño a nadie.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Resuelve los precios de Stripe a partir de sus lookup keys.
 *
 * Es el único punto del gateway que sabe cómo se llama un precio en Stripe. Todo lo demás
 * —checkout, cambio de plan, webhooks y la página de precios— pregunta aquí.
 */
@Injectable()
export class PriceCatalogService {
  private readonly logger = new Logger(PriceCatalogService.name);

  private cache: { catalog: Catalog; expiresAt: number } | null = null;
  /** Consulta en curso, para que N peticiones simultáneas con la caché fría no hagan N llamadas. */
  private inflight: Promise<Catalog> | null = null;

  constructor(private readonly stripeClient: StripeClient) {}

  /**
   * Price ID con el que cobrar un plan.
   *
   * Lanza si el plan no tiene precio en Stripe. Antes esto caía a un
   * `'price_MISSING_CONFIG_' + plan`, un identificador inventado que Stripe rechazaba con un
   * error que no decía nada del problema real. Fallar aquí señala la causa.
   */
  async priceIdFor(plan: SubscriptionPlan): Promise<string> {
    const lookupKey = PLAN_LOOKUP_KEYS[plan];
    if (!lookupKey) {
      throw new InternalServerErrorException(
        `El plan ${plan} no se cobra por Stripe y no tiene precio asociado`,
      );
    }
    return (await this.requirePrice(lookupKey)).id;
  }

  /** Importes vigentes de un plan, por moneda. Vacío si el plan no se cobra por Stripe. */
  async pricesFor(plan: SubscriptionPlan): Promise<PlanPrices> {
    const lookupKey = PLAN_LOOKUP_KEYS[plan];
    if (!lookupKey) return {};

    const catalog = await this.load();
    return catalog.byLookupKey.get(lookupKey)?.prices ?? {};
  }

  /**
   * Plan al que corresponde un Price ID, o `null` si no es de los nuestros.
   *
   * Es la resolución que usan los webhooks, y funciona igual sea cual sea la moneda del cobro:
   * `currency_options` añade importes al mismo objeto `Price`, así que el identificador que
   * llega en la factura es idéntico para un cobro en pesos y uno en dólares.
   */
  async planFor(priceId: string): Promise<SubscriptionPlan | null> {
    const catalog = await this.load();
    return catalog.planByPriceId.get(priceId) ?? null;
  }

  /** Price ID del crédito de overage. */
  async overagePriceId(): Promise<string> {
    return (await this.requirePrice(OVERAGE_LOOKUP_KEY)).id;
  }

  /** Precio por crédito de overage en una moneda, en unidades mínimas. */
  async overageUnitAmount(currency: BillingCurrency): Promise<number | undefined> {
    const catalog = await this.load();
    return catalog.byLookupKey.get(OVERAGE_LOOKUP_KEY)?.prices[currency];
  }

  /** Importes del overage en todas las monedas. */
  async overagePrices(): Promise<PlanPrices> {
    const catalog = await this.load();
    return catalog.byLookupKey.get(OVERAGE_LOOKUP_KEY)?.prices ?? {};
  }

  /**
   * Price ID de la recarga de créditos (cantidad libre, `quantity` variable). No es un plan, así
   * que —igual que el overage— no entra en `planByPriceId`.
   */
  async topUpPriceId(): Promise<string> {
    return (await this.requirePrice(CREDIT_TOPUP_LOOKUP_KEY)).id;
  }

  /** Importes de la recarga en todas las monedas, por crédito. */
  async topUpPrices(): Promise<PlanPrices> {
    const catalog = await this.load();
    return catalog.byLookupKey.get(CREDIT_TOPUP_LOOKUP_KEY)?.prices ?? {};
  }

  /**
   * Descarta la caché. Pensado para los tests y para forzar la relectura tras correr el script
   * de sincronización sin esperar al TTL.
   */
  invalidate(): void {
    this.cache = null;
  }

  private async requirePrice(lookupKey: string): Promise<CatalogPrice> {
    const catalog = await this.load();
    const price = catalog.byLookupKey.get(lookupKey);

    if (!price) {
      throw new InternalServerErrorException(
        `No hay ningún precio activo en Stripe con la lookup key "${lookupKey}". ` +
          'Corre scripts/stripe/sync-catalog.ts contra este entorno.',
      );
    }

    return price;
  }

  private async load(): Promise<Catalog> {
    if (this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.catalog;
    }

    // Si ya hay una consulta en vuelo, se espera esa en vez de lanzar otra.
    this.inflight ??= this.fetch()
      .then((catalog) => {
        this.cache = { catalog, expiresAt: Date.now() + CACHE_TTL_MS };
        return catalog;
      })
      .finally(() => {
        this.inflight = null;
      });

    return this.inflight;
  }

  private async fetch(): Promise<Catalog> {
    // `prices.list` acepta un array de lookup keys, así que todo el catálogo cabe en una
    // llamada. `currency_options` no viene por defecto: hay que pedirlo expandido o los
    // importes en pesos no aparecerían y la página mostraría solo dólares.
    const { data } = await this.stripeClient.stripe.prices.list({
      lookup_keys: ALL_LOOKUP_KEYS,
      active: true,
      expand: ['data.currency_options'],
      limit: ALL_LOOKUP_KEYS.length,
    });

    const byLookupKey = new Map<string, CatalogPrice>();
    for (const price of data) {
      if (!price.lookup_key) continue;
      byLookupKey.set(price.lookup_key, { id: price.id, prices: extractPrices(price) });
    }

    const planByPriceId = new Map<string, SubscriptionPlan>();
    for (const [plan, lookupKey] of Object.entries(PLAN_LOOKUP_KEYS)) {
      const price = byLookupKey.get(lookupKey);
      if (price) planByPriceId.set(price.id, plan as SubscriptionPlan);
    }

    const missing = ALL_LOOKUP_KEYS.filter((key) => !byLookupKey.has(key));
    if (missing.length) {
      // No se lanza aquí: puede faltar un precio que esta petición no necesita, y tumbar la
      // carga entera dejaría sin página de precios a quien sí tiene lo suyo. Quien pida uno
      // ausente recibirá el error concreto en `requirePrice`.
      this.logger.warn(`Faltan precios en Stripe para las lookup keys: ${missing.join(', ')}`);
    }

    return { byLookupKey, planByPriceId };
  }
}

/**
 * Aplana un `Price` de Stripe a un mapa moneda → importe.
 *
 * La moneda base vive en `currency`/`unit_amount` y las demás en `currency_options`; Stripe no
 * repite la base dentro de las opciones, así que hay que unir ambas.
 */
function extractPrices(price: {
  currency: string;
  unit_amount: number | null;
  currency_options?: Record<string, { unit_amount: number | null }> | null;
}): PlanPrices {
  const prices: PlanPrices = {};

  if (price.unit_amount !== null) {
    prices[price.currency as BillingCurrency] = price.unit_amount;
  }

  for (const [currency, option] of Object.entries(price.currency_options ?? {})) {
    if (option.unit_amount !== null) {
      prices[currency as BillingCurrency] = option.unit_amount;
    }
  }

  return prices;
}
