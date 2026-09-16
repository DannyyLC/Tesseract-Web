import { BillingCurrency, formatMoney, resolveBillingCurrency } from '@tesseract/types';
import { useOrganizationDashboard } from '@/hooks/identity/use-organizations';

/**
 * Moneda con la que se le cobra a la organización activa, y un formateador ya atado a ella.
 *
 * Se deriva del país de la organización. Mientras no haya contratado, `country` es null y se
 * muestran dólares: es la moneda de respaldo y lo que cobraba el sistema antes de existir esta
 * distinción. En cuanto pasa por el checkout, el país queda escrito y ya no cambia.
 *
 * **No se le pasa el idioma de la interfaz a `formatMoney`.** Antes sí (`useLocale()` de
 * next-intl, 'es' o 'en'), y con la UI en español eso hacía que `Intl.NumberFormat` formateara
 * con la convención de España —coma decimal, punto de millar— en vez de la mexicana: $200,00
 * en vez de $200.00, fácil de leer como "doscientos coma cero" y mucho más caro de lo que es.
 * El formato del dinero tiene que seguir el mercado al que se factura, no el idioma que eligió
 * el usuario para sus botones. Por eso se deja el default de `formatMoney` ('es-MX'), que usa
 * punto decimal y coma de millar tanto para MXN como para USD.
 */
export function useBillingCurrency(): {
  currency: BillingCurrency;
  /** Importe en unidades mínimas → texto listo para pintar. */
  format: (minorAmount: number | undefined) => string;
} {
  const { data: organization } = useOrganizationDashboard();

  const currency = resolveBillingCurrency(organization?.country);

  return {
    currency,
    format: (minorAmount) =>
      // Un precio ausente significa que ese plan no se cobra por Stripe (FREE, ENTERPRISE).
      minorAmount === undefined ? '—' : formatMoney(minorAmount, currency),
  };
}
