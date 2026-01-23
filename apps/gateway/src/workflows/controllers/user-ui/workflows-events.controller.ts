import { Controller, Sse, UseGuards, Param, MessageEvent } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Observable, fromEvent } from 'rxjs';
import { map, filter } from 'rxjs/operators';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { UserPayload } from '../../../common/types/jwt-payload.type';

interface ExecutionEvent {
  id: string;
  status: string;
  workflowId: string;
  organizationId: string;
  startedAt: Date;
  finishedAt?: Date;
  workflow?: {
    id: string;
    name: string;
  };
  [key: string]: any;
}

@Controller('workflows')
@UseGuards(JwtAuthGuard)
export class WorkflowsEventsController {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  @Sse('dashboard/stream')
  dashboardStream(@CurrentUser() user: UserPayload): Observable<MessageEvent> {
    return fromEvent(this.eventEmitter, 'execution.updated').pipe(
      filter((payload: any) => {
        // Security logic: only emit if the organization matches
        return payload.workflow?.organizationId === user.organizationId;
      }),
      map((payload: ExecutionEvent) => {
        // Map to DashboardWorkflowDto equivalent structure if needed, or send raw update
        // sending focused update for dashboard
        return {
          data: {
            executionId: payload.id,
            workflowId: payload.workflowId,
            status: payload.status,
            startedAt: payload.startedAt,
            finishedAt: payload.finishedAt,
            workflowName: payload.workflow?.name,
          },
          type: 'dashboard.update',
        } as MessageEvent;
      }),
    );
  }

  @Sse(':id/analytics/stream')
  analyticsStream(
    @CurrentUser() user: UserPayload,
    @Param('id') workflowId: string,
  ): Observable<MessageEvent> {
    return fromEvent(this.eventEmitter, 'execution.updated').pipe(
      filter((payload: any) => {
        // Security logic: Check organization AND workflow ID
        return (
          payload.workflow?.organizationId === user.organizationId &&
          payload.workflowId === workflowId
        );
      }),
      map((payload: ExecutionEvent) => {
        return {
          data: payload,
          type: 'analytics.update',
        } as MessageEvent;
      }),
    );
  }
}
