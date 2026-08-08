/**
 * Países de facturación y la moneda con la que se cobra a cada uno.
 *
 * **Esto sí es una lista blanca de validación**, a diferencia de `timezones.ts`. La zona
 * horaria puede ser cualquier identificador IANA porque solo afecta cómo se presentan las
 * fechas; el país, en cambio, decide en qué moneda se le cobra a la organización. Un país
 * que no sepamos mapear a una moneda no se puede facturar, así que el gateway rechaza
 * cualquier código que no esté aquí.
 *
 * Añadir un país es una línea. Quitarlo **no** es seguro: las organizaciones que ya lo
 * tengan guardado quedarían con un valor que el validador rechaza, y su moneda dejaría de
 * resolverse. Si algún día hay que retirar uno, primero hay que migrar sus filas.
 */

/** Monedas en las que sabemos cobrar. Cada una necesita su entrada en `currency_options`. */
export type BillingCurrency = 'usd' | 'mxn';

/**
 * Moneda para una organización cuyo país aún no se conoce.
 *
 * Solo aplica a organizaciones anteriores a este campo o que nunca han contratado: en cuanto
 * alguien pasa por el checkout, su país queda escrito. USD y no MXN a propósito — es lo que
 * cobraba el sistema antes de existir esta distinción, así que es lo que no cambia nada.
 */
export const FALLBACK_BILLING_CURRENCY: BillingCurrency = 'usd';

/** Regiones en las que se agrupa el selector. La UI traduce estas claves. */
export type CountryRegion = 'mexico' | 'latam' | 'northAmerica' | 'europe';

export interface CountryOption {
  /** Código ISO 3166-1 alpha-2, en mayúsculas. */
  code: string;
  currency: BillingCurrency;
}

export interface CountryGroup {
  region: CountryRegion;
  /** En el orden en que se muestran. */
  countries: CountryOption[];
}

/**
 * México primero porque es el mercado principal y el que tiene moneda propia; el resto cae
 * en USD hasta que exista una razón comercial para darle su propio punto de precio.
 */
export const COUNTRY_GROUPS: CountryGroup[] = [
  {
    region: 'mexico',
    countries: [{ code: 'MX', currency: 'mxn' }],
  },
  {
    region: 'latam',
    countries: [
      { code: 'CO', currency: 'usd' },
      { code: 'PE', currency: 'usd' },
      { code: 'CL', currency: 'usd' },
      { code: 'AR', currency: 'usd' },
      { code: 'BR', currency: 'usd' },
      { code: 'UY', currency: 'usd' },
      { code: 'EC', currency: 'usd' },
      { code: 'GT', currency: 'usd' },
      { code: 'CR', currency: 'usd' },
      { code: 'PA', currency: 'usd' },
      { code: 'DO', currency: 'usd' },
    ],
  },
  {
    region: 'northAmerica',
    countries: [
      { code: 'US', currency: 'usd' },
      { code: 'CA', currency: 'usd' },
    ],
  },
  {
    region: 'europe',
    countries: [{ code: 'ES', currency: 'usd' }],
  },
];

/** Todos los países admitidos, sin agrupar. Útil para tests y comprobaciones. */
export const SUPPORTED_COUNTRIES: string[] = COUNTRY_GROUPS.flatMap((group) =>
  group.countries.map((country) => country.code),
);

/**
 * Código de país → moneda de cobro.
 *
 * Se deriva de `COUNTRY_GROUPS` en vez de escribirse aparte: con dos listas a mano, tarde o
 * temprano una gana un país que la otra no tiene y la moneda deja de resolver.
 */
export const COUNTRY_CURRENCY: Record<string, BillingCurrency> = Object.fromEntries(
  COUNTRY_GROUPS.flatMap((group) =>
    group.countries.map((country) => [country.code, country.currency] as const),
  ),
);

/** Si un código puede facturarse. El validador del gateway se apoya en esto. */
export function isSupportedCountry(code: unknown): code is string {
  return typeof code === 'string' && code in COUNTRY_CURRENCY;
}

/**
 * Moneda con la que se le cobra a una organización.
 *
 * Acepta `null`/`undefined` porque `Organization.country` es nullable hasta el primer
 * checkout, y devuelve la moneda de respaldo en ese caso en vez de fallar: resolver la
 * moneda es una lectura que ocurre en sitios donde no hay nada que hacer con un error.
 * Quien necesite exigir país —el checkout— lo comprueba por su cuenta.
 */
export function resolveBillingCurrency(country?: string | null): BillingCurrency {
  if (!isSupportedCountry(country)) return FALLBACK_BILLING_CURRENCY;
  return COUNTRY_CURRENCY[country];
}

/**
 * Nombre del país en el idioma activo: `MX` → `México` / `Mexico`.
 *
 * Se delega en `Intl.DisplayNames` en lugar de traducirlo a mano para que añadir un país no
 * arrastre entradas nuevas en los archivos de mensajes. Si el runtime no lo soporta, devuelve
 * el propio código, que sigue siendo identificable.
 */
export function formatCountryName(code: string, locale = 'es'): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}
