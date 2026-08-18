import { Module } from '@nestjs/common';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { CreditsModule } from './credits/credits.module';
import { InvoiceModule } from './invoice/invoice.module';
import { FiscalProfileModule } from './fiscal-profile/fiscal-profile.module';

/**
 * Dominio de facturación. Agrupa y reexporta sus submódulos:
 * - subscriptions: core de Stripe (checkout, suscripciones, planes, webhook, portal) — ruta /billing
 * - credits: créditos/consumo
 * - invoice: facturas y su CFDI
 * - fiscal-profile: datos fiscales del receptor (solo México)
 */
@Module({
  imports: [SubscriptionsModule, CreditsModule, InvoiceModule, FiscalProfileModule],
  exports: [SubscriptionsModule, CreditsModule, InvoiceModule, FiscalProfileModule],
})
export class BillingModule {}
