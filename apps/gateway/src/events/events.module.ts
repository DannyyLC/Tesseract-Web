import { Module } from '@nestjs/common';
import { EventsService } from './services/events.service';
import { EventsController } from './controllers/events.controller';
import { ConversationsModule } from '../conversations/conversations.module';
import { UtilityModule } from '../utility/utility.module';

@Module({
  imports: [
    UtilityModule, 
    ConversationsModule,
  ],
  providers: [EventsService],
  exports: [EventsService],
  controllers: [EventsController],
})
export class EventsModule {}
