import { EventsService } from '../../services/events.service';
import { Body, Controller, Post, Sse, MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  // 1. Client connects here first via EventSource
  @Sse('stream')
  sse(): Observable<MessageEvent> {
    return this.eventsService.getEventStream();
  }

  // 2. Calling this POST method triggers an event to the stream
  @Post('send')
  async triggerEvent(@Body() payload: any) {
    this.eventsService.emitEvent({
      message: 'New notification!',
      content: payload,
    });
    return { status: 'Event sent to stream' };
  }
}
