import { Module } from '@nestjs/common';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { CreditsModule } from './credits/credits.module';
import { InvoiceModule } from './invoice/invoice.module';

/**
 * Dominio de facturación. Agrupa y reexporta sus submódulos:
 * - subscriptions: core de Stripe (checkout, suscripciones, planes, webhook, portal) — ruta /billing
 * - credits: créditos/consumo
 * - invoice: facturas
 */
@Module({
  imports: [SubscriptionsModule, CreditsModule, InvoiceModule],
  exports: [SubscriptionsModule, CreditsModule, InvoiceModule],
})
export class BillingModule {}
