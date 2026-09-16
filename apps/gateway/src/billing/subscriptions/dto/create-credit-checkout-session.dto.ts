import { BillingCurrency } from '@tesseract/types';

/** Argumentos internos del servicio; el cuerpo que llega por HTTP es `CreateCreditCheckoutDto`. */
export class CreateCreditCheckoutSessionDto {
  customerId: string;
  priceId: string;
  /** Créditos a comprar. Se usa como `quantity` de la línea: el precio es por crédito. */
  credits: number;
  currency: BillingCurrency;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
}
