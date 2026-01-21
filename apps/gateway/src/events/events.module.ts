import { Module } from '@nestjs/common';
import { EventsService } from './services/events.service';
import { EventsController } from './controllers/events.controller';

@Module({
  providers: [EventsService],
  exports: [EventsService],
  controllers: [EventsController],
})
export class EventsModule {}
