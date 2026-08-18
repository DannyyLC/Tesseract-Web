import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BillingService } from './billing.service';
import { StripeClient } from './stripe.client';
import { PriceCatalogService } from './price-catalog.service';
import { BillingController } from './billing.controller';
import { SubscriptionAdminController } from './controllers/admin/subscription.admin.controller';
import { CreditsModule } from '../credits/credits.module';
import { UtilityModule } from '@/platform/utility/utility.module';
import { OrganizationsModule } from '@/identity/organizations/organizations.module';
import { WebhookDedupModule } from '@/platform/webhooks/webhook-dedup.module';
import { InvoiceModule } from '../invoice/invoice.module';

@Module({
  imports: [
    UtilityModule,
    ConfigModule,
    CreditsModule,
    OrganizationsModule,
    WebhookDedupModule,
    // Por el CfdiService: en cuanto el cobro se confirma y los créditos están otorgados, se
    // timbra la factura.
    InvoiceModule,
  ],
  controllers: [BillingController, SubscriptionAdminController],
  providers: [BillingService, StripeClient, PriceCatalogService],
  exports: [BillingService, PriceCatalogService],
})
export class SubscriptionsModule {}
