import { Module } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { DatabaseModule } from '../database/database.module';

/**
 * ConversationsModule
 * Centraliza toda la lógica de gestión de conversaciones
 */
@Module({
  imports: [DatabaseModule],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
