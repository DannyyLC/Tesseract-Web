import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BillingService } from './billing.service';
import { StripeClient } from './stripe.client';
import { BillingController } from './billing.controller';
import { CreditsModule } from '../credits/credits.module';
import { UtilityModule } from '@/platform/utility/utility.module';
import { OrganizationsModule } from '@/identity/organizations/organizations.module';
import { WebhookDedupModule } from '@/platform/webhooks/webhook-dedup.module';

@Module({
  imports: [UtilityModule, ConfigModule, CreditsModule, OrganizationsModule, WebhookDedupModule],
  controllers: [BillingController],
  providers: [BillingService, StripeClient],
  exports: [BillingService],
})
export class SubscriptionsModule {}
