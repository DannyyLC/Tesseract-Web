import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BillingService } from './billing.service';
import { StripeClient } from './stripe.client';
import { BillingController } from './billing.controller';
import { CreditsModule } from '../credits/credits.module';
import { UtilityModule } from '../utility/utility.module';

@Module({
  imports: [
    UtilityModule,
    ConfigModule, 
    CreditsModule
  ],
  controllers: [BillingController],
  providers: [BillingService, StripeClient],
  exports: [BillingService],
})
export class BillingModule {}
