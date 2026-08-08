import { useLocale } from 'next-intl';
import { BillingCurrency, formatMoney, resolveBillingCurrency } from '@tesseract/types';
import { useOrganizationDashboard } from '@/hooks/identity/use-organizations';

/**
 * Moneda con la que se le cobra a la organización activa, y un formateador ya atado a ella.
 *
 * Se deriva del país de la organización. Mientras no haya contratado, `country` es null y se
 * muestran dólares: es la moneda de respaldo y lo que cobraba el sistema antes de existir esta
 * distinción. En cuanto pasa por el checkout, el país queda escrito y ya no cambia.
 */
export function useBillingCurrency(): {
  currency: BillingCurrency;
  /** Importe en unidades mínimas → texto listo para pintar. */
  format: (minorAmount: number | undefined) => string;
} {
  const locale = useLocale();
  const { data: organization } = useOrganizationDashboard();

  const currency = resolveBillingCurrency(organization?.country);

  return {
    currency,
    format: (minorAmount) =>
      // Un precio ausente significa que ese plan no se cobra por Stripe (FREE, ENTERPRISE).
      minorAmount === undefined ? '—' : formatMoney(minorAmount, currency, locale),
  };
}
