import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { EventsService } from '../services/events.service';
import { Body, Controller, Post, Sse, MessageEvent, UseGuards } from '@nestjs/common';
import { filter, Observable } from 'rxjs';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserPayload } from '../../common/types/jwt-payload.type';
import { Organization } from '@workflow-platform/database';
import { DashboardConversationDto } from '../../conversations/dto';

@Controller('events')
@UseGuards(JwtAuthGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Sse('organization/stream')
  getOrganizationStream(
    @CurrentUser() user: UserPayload
  ): Observable<MessageEvent> {
    return this.eventsService.getOrganizationStream().pipe(
      filter(event => (event.data as Organization)?.id === user.organizationId)
    );
  }

  @Sse('workflow/stream')
  getWorkflowStream(
    @CurrentUser() user: UserPayload
  ): Observable<MessageEvent> {
    return this.eventsService.getWorkflowStream().pipe(
      filter(event => (event.data as any)?.organizationId === user.organizationId)
    );
  }

  @Sse('conversation/stream')
  getConversationsStream(
    @CurrentUser() user: UserPayload
  ): Observable<MessageEvent> {
    return this.eventsService.getConversationsStream().pipe(
      filter(event => (event.data as DashboardConversationDto)?.organizationId === user.organizationId)
    );
  }
}
