import { Module } from '@nestjs/common';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AnalyticsAdminController } from './controllers/admin/analytics.admin.controller';
import { AdminAnalyticsService } from './analytics.service';

/**
 * Analítica de costos de plataforma (super admin). Depende de `SubscriptionsModule` por
 * `PriceCatalogService`, que es la única fuente de verdad de cuánto vale un plan en Stripe.
 */
@Module({
  imports: [SubscriptionsModule],
  controllers: [AnalyticsAdminController],
  providers: [AdminAnalyticsService],
})
export class AnalyticsModule {}
