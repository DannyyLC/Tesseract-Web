import { Module } from '@nestjs/common';
import { EventsService } from './services/events.service';
import { EventsController } from './controllers/events.controller';
import { ConversationsModule } from '../conversations/conversations.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [
    DatabaseModule, // <-- Use forwardRef here if needed
    ConversationsModule
  ],
  providers: [EventsService],
  exports: [EventsService],
  controllers: [EventsController],
})
export class EventsModule {}
