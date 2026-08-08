/**
 * Sincroniza el catálogo de precios de Stripe con lo declarado en este archivo.
 *
 * **Es la herramienta de operación:** para cambiar un precio se edita `CATALOG` aquí abajo y se
 * vuelve a correr. No hace falta redeploy ni tocar variables de entorno, porque el gateway
 * resuelve los precios por su lookup key contra la API de Stripe.
 *
 * Nunca se ejecuta solo. La etapa final de `apps/gateway/Dockerfile` copia únicamente los
 * `dist` compilados, así que este archivo no existe en la imagen que corre en Cloud Run: no hay
 * ruta, guard ni cron que pueda alcanzarlo.
 *
 *   pnpm stripe:catalog            # dry-run: imprime el diff y no escribe nada
 *   pnpm stripe:catalog --apply    # escribe
 *
 * Para producción, la clave se exporta solo en esa invocación:
 *
 *   STRIPE_SECRET_KEY=sk_live_... pnpm stripe:catalog --apply
 *
 * Es idempotente y está indexado por lookup key: busca el precio por su clave, lo actualiza si
 * existe y lo crea si no. Correrlo dos veces seguidas no cambia nada la segunda vez.
 */

import Stripe from 'stripe';
import {
  OVERAGE_LOOKUP_KEY,
  PLAN_LOOKUP_KEYS,
  PLANS,
  SubscriptionPlan,
} from '@tesseract/types';

// ============================================================
// CATÁLOGO — lo único que hay que editar para cambiar un precio
// ============================================================

/**
 * Importes en **unidades mínimas** (centavos), que es como los guarda Stripe.
 * `usd: 2500` son 25.00 dólares; `mxn: 49900` son 499.00 pesos.
 *
 * Los importes en pesos no son la conversión de los de dólares: son un punto de precio propio
 * para el mercado mexicano. Cambiar uno no obliga a tocar el otro.
 */
interface CatalogEntry {
  lookupKey: string;
  productName: string;
  description: string;
  /** Mensual recurrente, o pago único para el overage. */
  recurring: boolean;
  amounts: { usd: number; mxn: number };
}

const CATALOG: CatalogEntry[] = [
  {
    lookupKey: PLAN_LOOKUP_KEYS[SubscriptionPlan.STARTER]!,
    productName: 'Tesseract Starter',
    description: PLANS[SubscriptionPlan.STARTER].description,
    recurring: true,
    amounts: { usd: 2500, mxn: 49900 },
  },
  {
    lookupKey: PLAN_LOOKUP_KEYS[SubscriptionPlan.GROWTH]!,
    productName: 'Tesseract Growth',
    description: PLANS[SubscriptionPlan.GROWTH].description,
    recurring: true,
    amounts: { usd: 7900, mxn: 159000 },
  },
  {
    lookupKey: PLAN_LOOKUP_KEYS[SubscriptionPlan.BUSINESS]!,
    productName: 'Tesseract Business',
    description: PLANS[SubscriptionPlan.BUSINESS].description,
    recurring: true,
    amounts: { usd: 19900, mxn: 399000 },
  },
  {
    lookupKey: PLAN_LOOKUP_KEYS[SubscriptionPlan.PRO]!,
    productName: 'Tesseract Pro',
    description: PLANS[SubscriptionPlan.PRO].description,
    recurring: true,
    amounts: { usd: 49900, mxn: 999000 },
  },
  {
    lookupKey: OVERAGE_LOOKUP_KEY,
    productName: 'Tesseract — Crédito adicional',
    description: 'Crédito consumido por encima del saldo del plan',
    // Pago único: se adjunta como línea a la factura del mes en que hubo consumo extra, con
    // `quantity` igual a los créditos debidos. No es una suscripción aparte.
    recurring: false,
    amounts: { usd: 16, mxn: 320 },
  },
];

// ============================================================

const APPLY = process.argv.includes('--apply');

function log(action: string, detail: string) {
  const prefix = APPLY ? '' : '[dry-run] ';
  console.log(`${prefix}${action.padEnd(9)} ${detail}`);
}

function formatAmounts(amounts: CatalogEntry['amounts']): string {
  return `USD ${(amounts.usd / 100).toFixed(2)} / MXN ${(amounts.mxn / 100).toFixed(2)}`;
}

/** Importes actuales de un precio, aplanando `currency_options` sobre la moneda base. */
function currentAmounts(price: Stripe.Price): Record<string, number | null | undefined> {
  const current: Record<string, number | null | undefined> = {
    [price.currency]: price.unit_amount,
  };
  for (const [currency, option] of Object.entries(price.currency_options ?? {})) {
    current[currency] = option.unit_amount;
  }
  return current;
}

function isUpToDate(price: Stripe.Price, entry: CatalogEntry): boolean {
  const current = currentAmounts(price);
  return current.usd === entry.amounts.usd && current.mxn === entry.amounts.mxn;
}

async function findProduct(stripe: Stripe, name: string): Promise<Stripe.Product | undefined> {
  // `products.list` no filtra por nombre, así que se pagina y se compara. Son unos pocos
  // productos; no vale la pena mantener un índice aparte.
  for await (const product of stripe.products.list({ active: true, limit: 100 })) {
    if (product.name === name) return product;
  }
  return undefined;
}

async function syncEntry(stripe: Stripe, entry: CatalogEntry): Promise<void> {
  const { data } = await stripe.prices.list({
    lookup_keys: [entry.lookupKey],
    active: true,
    expand: ['data.currency_options'],
    limit: 1,
  });
  const existing = data[0];

  // --- El precio ya existe ---
  if (existing) {
    if (isUpToDate(existing, entry)) {
      log('sin cambio', `${entry.lookupKey} (${existing.id}) — ${formatAmounts(entry.amounts)}`);
      return;
    }

    log(
      'actualiza',
      `${entry.lookupKey} (${existing.id}) → ${formatAmounts(entry.amounts)}\n` +
        `             antes: ${JSON.stringify(currentAmounts(existing))}`,
    );
    if (!APPLY) return;

    try {
      await stripe.prices.update(existing.id, {
        currency_options: {
          usd: { unit_amount: entry.amounts.usd },
          mxn: { unit_amount: entry.amounts.mxn },
        },
      });
      return;
    } catch {
      // Stripe no permite reescribir el importe de un `Price` ya usado. En ese caso se crea uno
      // nuevo y se le muda la lookup key con `transfer_lookup_key`: las suscripciones vigentes
      // se quedan en el precio viejo —grandfathering— y las nuevas toman el nuevo, sin que el
      // código note la diferencia porque sigue pidiendo la misma clave.
      log('recrea', `${entry.lookupKey} — el precio existente no admite cambios de importe`);
      await createPrice(stripe, entry, existing.product as string, true);
      return;
    }
  }

  // --- No existe: hay que crear producto (si falta) y precio ---
  log('crea', `${entry.lookupKey} — ${formatAmounts(entry.amounts)}`);
  if (!APPLY) return;

  let product = await findProduct(stripe, entry.productName);
  if (!product) {
    product = await stripe.products.create({
      name: entry.productName,
      description: entry.description,
    });
  }

  await createPrice(stripe, entry, product.id, false);
}

async function createPrice(
  stripe: Stripe,
  entry: CatalogEntry,
  productId: string,
  transferLookupKey: boolean,
): Promise<void> {
  await stripe.prices.create({
    product: productId,
    lookup_key: entry.lookupKey,
    transfer_lookup_key: transferLookupKey,
    // La moneda base es USD y las demás van en `currency_options`. Lo que hace que esto
    // funcione es que el Price ID no cambia entre monedas: una factura en pesos y una en
    // dólares traen el mismo identificador, así que la atribución del cobro a su plan nunca
    // depende del importe.
    currency: 'usd',
    unit_amount: entry.amounts.usd,
    currency_options: {
      mxn: { unit_amount: entry.amounts.mxn },
    },
    ...(entry.recurring ? { recurring: { interval: 'month' as const } } : {}),
  });
}

async function main() {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey || apiKey.startsWith('sk_test_...') || apiKey === 'sk_test_...') {
    console.error(
      'Falta STRIPE_SECRET_KEY. Expórtala en el entorno o ponla en .env.\n' +
        'Para producción:  STRIPE_SECRET_KEY=sk_live_... pnpm stripe:catalog --apply',
    );
    process.exit(1);
  }

  const mode = apiKey.startsWith('sk_live_') ? 'LIVE' : 'TEST';
  console.log(`\nCatálogo de Stripe — modo ${mode}${APPLY ? '' : ' — DRY RUN (no escribe)'}\n`);

  const stripe = new Stripe(apiKey, { apiVersion: '2025-01-27.acacia' as never });

  for (const entry of CATALOG) {
    await syncEntry(stripe, entry);
  }

  console.log(
    APPLY
      ? '\nListo. El gateway tomará los precios nuevos en cuanto expire su caché (5 min).\n'
      : '\nNada escrito. Vuelve a correrlo con --apply para aplicar los cambios.\n',
  );
}

main().catch((error) => {
  console.error('\nFalló la sincronización:', error instanceof Error ? error.message : error);
  process.exit(1);
});
