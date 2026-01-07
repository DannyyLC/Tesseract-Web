import { Module } from '@nestjs/common';
import { ConversationsService } from './conversations.service';

/**
 * ConversationsModule
 * Centraliza toda la lógica de gestión de conversaciones
 */
@Module({
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
