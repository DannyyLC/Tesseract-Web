import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { UtilityModule } from '@/platform/utility/utility.module';
import { WorkflowsModule } from '@/automation/workflows/workflows.module';
import { WhatsappConfigController } from './controllers/user-ui/whatsapp-config.controller';
import { WhatsappConfigService } from './whatsapp-config.service';
import { WhatsappMessageQueueService } from './whatsapp-message-queue.service';
import { MediaProcessingModule } from '@/automation/media-processing/media-processing.module';
import { OpenAiCompatibleMediaProcessorAdapter } from '@/automation/media-processing/adapters/openai-compatible-media-processor.adapter';
import { GoogleDriveModule } from '@/platform/cloud/google-drive/google-drive.module';
import { ConversationsModule } from '@/messaging/conversations/conversations.module';
import { GoogleDriveService } from '@/platform/cloud/google-drive/google-drive.service';
import { ConversationsService } from '@/messaging/conversations/conversations.service';
import { WebhookDedupModule } from '@/platform/webhooks/webhook-dedup.module';

@Module({
  imports: [UtilityModule, HttpModule, WorkflowsModule, MediaProcessingModule, GoogleDriveModule, ConversationsModule, WebhookDedupModule],
  providers: [WhatsappConfigService, WhatsappMessageQueueService, OpenAiCompatibleMediaProcessorAdapter, GoogleDriveService, ConversationsService],
  controllers: [WhatsappConfigController],
  exports: [WhatsappConfigService, WhatsappMessageQueueService],
})
export class WhatsappConfigModule {}
