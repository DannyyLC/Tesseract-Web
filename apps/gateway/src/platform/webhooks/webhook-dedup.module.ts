import { Module } from '@nestjs/common';
import { WebhookDedupService } from './webhook-dedup.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [WebhookDedupService],
  exports: [WebhookDedupService],
})
export class WebhookDedupModule {}
