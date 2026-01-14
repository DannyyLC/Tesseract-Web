import { Module } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './controllers/user-ui/subscriptions.controller';

@Module({
  providers: [SubscriptionsService],
  controllers: [SubscriptionsController]
})
export class SubscriptionsModule {}
