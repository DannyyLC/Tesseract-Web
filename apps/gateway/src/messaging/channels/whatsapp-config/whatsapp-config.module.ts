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
import { WebhookDedupModule } from '@/platform/webhooks/webhook-dedup.module';
import { CloudTasksModule } from '@/platform/tasks/cloud-tasks.module';
import { WhatsappWorkerController } from './controllers/internal/whatsapp-worker.controller';
import { WhatsappConfigAdminController } from './controllers/admin/whatsapp-config.admin.controller';
import { EndUsersModule } from '@/identity/end-users/end-users.module';

@Module({
  // `EndUsersModule` va por la lista negra: el webhook descarta lo que mande un contacto bloqueado.
  imports: [UtilityModule, HttpModule, WorkflowsModule, MediaProcessingModule, GoogleDriveModule, ConversationsModule, WebhookDedupModule, CloudTasksModule, EndUsersModule],
  providers: [WhatsappConfigService, WhatsappMessageQueueService],
  controllers: [WhatsappConfigController, WhatsappWorkerController, WhatsappConfigAdminController],
  exports: [WhatsappConfigService, WhatsappMessageQueueService],
})
export class WhatsappConfigModule {}
