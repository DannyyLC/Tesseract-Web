import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ConversationsController } from './controllers/user-ui/conversations.controller';
import { ConversationsService } from './conversations.service';

/**
 * ConversationsModule
 * Centraliza toda la lógica de gestión de conversaciones
 */
@Module({
  imports: [DatabaseModule],
  providers: [ConversationsService],
  exports: [ConversationsService],
  controllers: [ConversationsController],
})
export class ConversationsModule {}
