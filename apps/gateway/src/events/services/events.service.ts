import { Injectable, MessageEvent } from '@nestjs/common';
import { last, Observable, Subject } from 'rxjs';
import { EventSubjectType } from '../utils/subjects-enum';
import { DashboardOrganizationDto } from '@/organizations/dto';
import { DashboardWorkflowDto } from '@/workflows/dto';

@Injectable()
export class EventsService {
  private readonly organizationSubject = new Subject<MessageEvent>();
  private readonly workflowSubject = new Subject<MessageEvent>();
  private readonly conversationsSubject = new Subject<MessageEvent>();
  constructor(){}
  // POST method will call this to push data
  asyncemitEvent(model: string, action: string, data: any) {
    const formattedData = this.getFormattedData(model, data);
    switch (model) {
      case EventSubjectType.ORGANIZATION:
        this.organizationSubject.next({ 
          id: data.id,
          data: data,
          type: `${model}.${action}`,
          retry: 3000
         });
        break;

      case EventSubjectType.WORKFLOW:
        this.workflowSubject.next({ 
          id: data.id,
          data: data,
          type: `${model}.${action}`,
          retry: 3000
         });
        break;

      case EventSubjectType.CONVERSATION:
      case EventSubjectType.MESSAGE:
        this.conversationsSubject.next({ 
          id: data.id,
          data: data,
          type: `${model}.${action}`,
          retry: 3000
         });
        break;

      default:
        break;
    }
  }

  getFormattedData(model: string, data: any): any {
    switch (model) {
      case EventSubjectType.ORGANIZATION:
        return {
          id: data.id,
          name: data.name,
          plan: data.plan,
          allowOverages: data.allowOverages,
          overageLimit: data.overageLimit,
          isActive: data.isActive,
          createdAt: data.createdAt,
          customMaxUsers: data.customMaxUsers,
          customMaxApiKeys: data.customMaxApiKeys,
          customMaxWorkflows: data.customMaxWorkflows
        } as DashboardOrganizationDto;

      case EventSubjectType.WORKFLOW:
        return {
          id: data.id,
          name: data.name,
          description: data.description,
          category: data.category,
          isActive: data.isActive,
          isPaused: data.isPaused,
          version: data.version,
          triggerType: data.triggerType,
          schedule: data.schedule,
          maxTokensPerExecution: data.maxTokensPerExecution,
          totalExecutions: data.totalExecutions,
          successfulExecutions: data.successfulExecutions,
          failedExecutions: data.failedExecutions,
          totalCreditsConsumed: data.totalCreditsConsumed,
          lastExecutedAt: data.lastExecutedAt,
          avgExecutionTime: data.avgExecutionTime
        } as DashboardWorkflowDto;
      case EventSubjectType.CONVERSATION:
      case EventSubjectType.MESSAGE:
        return data; //TODO; definir DTOs si es necesario
      default:
        break;
    }
  }

  getOrganizationStream(): Observable<MessageEvent> {
    return this.organizationSubject.asObservable();
  }

  getWorkflowStream(): Observable<MessageEvent> {
    return this.workflowSubject.asObservable();
  }

  getConversationsStream(): Observable<MessageEvent> {
    return this.conversationsSubject.asObservable();
  }
}
