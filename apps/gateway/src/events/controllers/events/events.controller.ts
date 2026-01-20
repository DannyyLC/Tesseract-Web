import { EventsService } from '../../services/events.service';
import { Body, Controller, Post, Sse, MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  // 1. Client connects here first via EventSource
  @Sse('UserVerification/stream')
  sse(): Observable<MessageEvent> {
    return this.eventsService.getUserVerificationStream();
  }

}
