import { BillingCurrency } from '@tesseract/types';

/** Argumentos internos del servicio; el cuerpo que llega por HTTP es `CreateCheckoutRequestDto`. */
export class CreateCheckoutSessionDto {
  customerId: string;
  priceId: string;
  /**
   * Moneda del cobro. Selecciona cuál de las `currency_options` del precio se aplica: el
   * `priceId` es el mismo para todas, solo cambia el importe.
   */
  currency: BillingCurrency;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
  allowPromotionCodes?: boolean;
}
