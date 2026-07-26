import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { UtilityModule } from '@/platform/utility/utility.module';
import { WorkflowsModule } from '@/automation/workflows/workflows.module';
import { WhatsappConfigController } from './controllers/user-ui/whatsapp-config.controller';
import { WhatsappConfigService } from './whatsapp-config.service';
import { WhatsappMessageQueueService } from './whatsapp-message-queue.service';
import { MediaProcessingModule } from '@/automation/media-processing/media-processing.module';
import { GoogleDriveModule } from '@/platform/cloud/google-drive/google-drive.module';
import { ConversationsModule } from '@/messaging/conversations/conversations.module';
import { GoogleDriveService } from '@/platform/cloud/google-drive/google-drive.service';
import { ConversationsService } from '@/messaging/conversations/conversations.service';
import { WebhookDedupModule } from '@/platform/webhooks/webhook-dedup.module';
import { CloudTasksModule } from '@/platform/tasks/cloud-tasks.module';
import { WhatsappWorkerController } from './controllers/internal/whatsapp-worker.controller';

@Module({
  imports: [UtilityModule, HttpModule, WorkflowsModule, MediaProcessingModule, GoogleDriveModule, ConversationsModule, WebhookDedupModule, CloudTasksModule],
  providers: [WhatsappConfigService, WhatsappMessageQueueService, GoogleDriveService, ConversationsService],
  controllers: [WhatsappConfigController, WhatsappWorkerController],
  exports: [WhatsappConfigService, WhatsappMessageQueueService],
})
export class WhatsappConfigModule {}
