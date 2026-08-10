import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ToolsModule } from '@/automation/tools/core/tools.module';
import { ConversationsController } from './controllers/user-ui/conversations.controller';
import { ConversationsService } from './conversations.service';
import { UtilityModule } from '@/platform/utility/utility.module';
import { MediaProcessingModule } from '@/automation/media-processing/media-processing.module';

/**
 * ConversationsModule
 * Centraliza toda la lógica de gestión de conversaciones
 */
@Module({
  imports: [UtilityModule, MediaProcessingModule, HttpModule, ToolsModule],
  providers: [ConversationsService],
  exports: [ConversationsService],
  controllers: [ConversationsController],
})
export class ConversationsModule {}
