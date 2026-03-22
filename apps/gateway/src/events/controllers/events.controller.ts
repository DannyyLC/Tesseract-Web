import { Controller, MessageEvent, Sse, UseGuards } from '@nestjs/common';
import { filter, mergeMap, Observable } from 'rxjs';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserPayload } from '../../common/types/jwt-payload.type';
import { AppNotificationDto } from '../app-notifications/notification.dto';
import { EventsService } from '../services/events.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@Controller('events')
@UseGuards(JwtAuthGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Sse('organization/stream')
  getOrganizationStream(@CurrentUser() user: UserPayload): Observable<MessageEvent> {
    return this.eventsService
      .getOrganizationStream()
      .pipe(
        filter(
          (event) =>
            (event.data as { organizationId: string })?.organizationId === user.organizationId,
        ),
      );
  }

  @Sse('workflow/stream')
  getWorkflowStream(@CurrentUser() user: UserPayload): Observable<MessageEvent> {
    return this.eventsService
      .getWorkflowStream()
      .pipe(
        filter(
          (event) =>
            (event.data as { organizationId: string })?.organizationId === user.organizationId,
        ),
      );
  }

  @Sse('conversation/stream')
  getConversationsStream(@CurrentUser() user: UserPayload): Observable<MessageEvent> {
    return this.eventsService
      .getConversationsStream()
      .pipe(
        filter(
          (event) =>
            (event.data as { organizationId: string })?.organizationId === user.organizationId,
        ),
      );
  }

  @Sse('user/stream')
  getUserStream(@CurrentUser() user: UserPayload): Observable<MessageEvent> {
    return this.eventsService
      .getUserStream()
      .pipe(
        filter(
          (event) =>
            (event.data as { organizationId: string })?.organizationId === user.organizationId,
        ),
      );
  }

  @Sse('credit-balance/stream')
  getCreditBalanceStream(@CurrentUser() user: UserPayload): Observable<MessageEvent> {
    return this.eventsService
      .getCreditBalanceStream()
      .pipe(
        filter(
          (event) =>
            (event.data as { organizationId: string })?.organizationId === user.organizationId,
        ),
      );
  }

  @Sse('credit-transaction/stream')
  getCreditTransactionsStream(@CurrentUser() user: UserPayload): Observable<MessageEvent> {
    return this.eventsService
      .getCreditTransactionsStream()
      .pipe(
        filter(
          (event) =>
            (event.data as { organizationId: string })?.organizationId === user.organizationId,
        ),
      );
  }

  @Sse('end-user/stream')
  getEndUsersStream(@CurrentUser() user: UserPayload): Observable<MessageEvent> {
    return this.eventsService
      .getEndUserStream()
      .pipe(
        filter(
          (event) =>
            (event.data as { organizationId: string })?.organizationId === user.organizationId,
        ),
      );
  }

  @Sse('execution/stream')
  getExecutionsStream(@CurrentUser() user: UserPayload): Observable<MessageEvent> {
    return this.eventsService
      .getExecutionStream()
      .pipe(
        filter(
          (event) =>
            (event.data as { organizationId: string })?.organizationId === user.organizationId,
        ),
      );
  }

  @Sse('api-key/stream')
  getApiKeysStream(@CurrentUser() user: UserPayload): Observable<MessageEvent> {
    return this.eventsService
      .getApiKeysStream()
      .pipe(
        filter(
          (event) =>
            (event.data as { organizationId: string })?.organizationId === user.organizationId,
        ),
      );
  }

  @Sse('invoice/stream')
  getInvoiceStream(@CurrentUser() user: UserPayload): Observable<MessageEvent> {
    return this.eventsService
      .getInvoiceStream()
      .pipe(
        filter(
          (event) =>
            (event.data as { organizationId: string })?.organizationId === user.organizationId,
        ),
      );
  }

  @Sse('subscription/stream')
  getSubscriptionStream(@CurrentUser() user: UserPayload): Observable<MessageEvent> {
    return this.eventsService
      .getSubscriptionStream()
      .pipe(
        filter(
          (event) =>
            (event.data as { organizationId: string })?.organizationId === user.organizationId,
        ),
      );
  }

  @Sse('app-notifications/stream')
  getAppNotificationsStream(@CurrentUser() user: UserPayload): Observable<MessageEvent> {
    return this.eventsService
      .getAppNotificationsStream()
      .pipe(
        filter(
          (event) =>
            (event.data as { organizationId: string })?.organizationId === user.organizationId &&
            (event.data as { roles: string[] })?.roles?.includes(user.role),
        ),
      )
      .pipe(
        mergeMap((event) => {
          event.data = (event.data as AppNotificationDto)?.notification;
          const sanitizedEvent = event;
          return sanitizedEvent ? [sanitizedEvent] : [];
        }),
      );
  }

  @Sse('whatsapp-config/stream')
  getWhatsappConfigStream(@CurrentUser() user: UserPayload): Observable<MessageEvent> {
    return this.eventsService
      .getWhatsappConfigStream()
      .pipe(
        filter(
          (event) => {
            console.log('Received WhatsApp config event:', event.data);
            return (event.data as { organizationId: string })?.organizationId === user.organizationId;
          }
        ),
      );
  }
}
