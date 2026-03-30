import { Module } from '@nestjs/common';
import { ConversationsController } from './controllers/user-ui/conversations.controller';
import { ConversationsService } from './conversations.service';
import { UtilityModule } from '../utility/utility.module';

/**
 * ConversationsModule
 * Centraliza toda la lógica de gestión de conversaciones
 */
@Module({
  imports: [UtilityModule],
  providers: [ConversationsService],
  exports: [ConversationsService],
  controllers: [ConversationsController],
})
export class ConversationsModule {}
