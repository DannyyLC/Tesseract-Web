import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { MediaProcessingModule } from '@/automation/media-processing/media-processing.module';
import { ToolsModule } from '@/automation/tools/core/tools.module';
import { WorkflowsModule } from '@/automation/workflows/workflows.module';
import { ConversationsModule } from '@/messaging/conversations/conversations.module';
import { GoogleDriveModule } from '@/platform/cloud/google-drive/google-drive.module';
import { CloudTasksModule } from '@/platform/tasks/cloud-tasks.module';
import { UtilityModule } from '@/platform/utility/utility.module';
import { WebhookDedupModule } from '@/platform/webhooks/webhook-dedup.module';
import { MessengerWorkerController } from './controllers/internal/messenger-worker.controller';
import { MessengerController } from './controllers/user-ui/messenger.controller';
import { MessengerConfigService } from './messenger-config.service';
import { MessengerMessageQueueService } from './messenger-message-queue.service';
import { EndUsersModule } from '@/identity/end-users/end-users.module';

@Module({
  imports: [
    UtilityModule,
    HttpModule,
    WorkflowsModule,
    MediaProcessingModule,
    GoogleDriveModule,
    ConversationsModule,
    WebhookDedupModule,
    CloudTasksModule,
    // Por KmsService: el token de página se guarda cifrado.
    ToolsModule,
    // Por la lista negra: el webhook descarta lo que mande un contacto bloqueado.
    EndUsersModule,
  ],
  providers: [MessengerConfigService, MessengerMessageQueueService],
  controllers: [MessengerController, MessengerWorkerController],
  exports: [MessengerConfigService, MessengerMessageQueueService],
})
export class MessengerModule {}
