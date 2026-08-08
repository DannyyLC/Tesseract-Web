import { usePlans } from './use-billing';
import { useBillingCurrency } from './use-billing-currency';

/**
 * Precio por crédito de overage, ya formateado en la moneda de la organización.
 *
 * Sale del mismo endpoint que los planes, no de una constante: el importe vive únicamente en
 * Stripe, y una copia en el bundle habría empezado a mentir en cuanto alguien corriera el
 * script de catálogo.
 *
 * Devuelve cadena vacía mientras carga, para que el texto no parpadee con un cero.
 */
export function useOveragePrice(): { formatted: string; unitAmount: number | undefined } {
  const { data } = usePlans();
  const { currency, format } = useBillingCurrency();

  const unitAmount = data?.overagePerCredit[currency];

  return {
    unitAmount,
    formatted: unitAmount === undefined ? '' : format(unitAmount),
  };
}
