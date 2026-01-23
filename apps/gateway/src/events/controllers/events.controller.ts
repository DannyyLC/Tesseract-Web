import { EventsService } from '../services/events.service';
import { Body, Controller, Post, Sse, MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Sse('organization/stream')
  getOrganizationStream(): Observable<MessageEvent> {
    return this.eventsService.getOrganizationStream();
  }

  @Sse('workflow/stream')
  getWorkflowStream(): Observable<MessageEvent> {
    return this.eventsService.getWorkflowStream();
  }

  @Sse('conversation/stream')
  getConversationsStream(): Observable<MessageEvent> {
    return this.eventsService.getConversationsStream();
  }
}
