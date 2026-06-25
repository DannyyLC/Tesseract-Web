import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { UtilityModule } from '@/platform/utility/utility.module';
import { WorkflowsModule } from '@/automation/workflows/workflows.module';
import { WhatsappConfigController } from './controllers/user-ui/whatsapp-config.controller';
import { WhatsappConfigService } from './whatsapp-config.service';
import { WhatsappMessageQueueService } from './whatsapp-message-queue.service';
import { MediaProcessingModule } from '@/automation/media-processing/media-processing.module';
import { OpenAiCompatibleMediaProcessorAdapter } from '@/automation/media-processing/adapters/openai-compatible-media-processor.adapter';

@Module({
  imports: [UtilityModule, HttpModule, WorkflowsModule, MediaProcessingModule],
  providers: [WhatsappConfigService, WhatsappMessageQueueService, OpenAiCompatibleMediaProcessorAdapter],
  controllers: [WhatsappConfigController],
  exports: [WhatsappConfigService, WhatsappMessageQueueService],
})
export class WhatsappConfigModule {}
