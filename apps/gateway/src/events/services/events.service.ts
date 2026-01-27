import { Injectable, MessageEvent } from '@nestjs/common';
import { last, Observable, Subject } from 'rxjs';
import { EventSubjectType } from '../utils/subjects-enum';
import { DashboardOrganizationDto } from '@/organizations/dto';
import { DashboardWorkflowDto } from '@/workflows/dto';
import { ConversationsService } from '../../conversations/conversations.service';
import { PrismaService } from '../../database/prisma.service';
import { DashboardConversationDto } from '../../conversations/dto';

@Injectable()
export class EventsService {
  private readonly organizationSubject = new Subject<MessageEvent>();
  private readonly workflowSubject = new Subject<MessageEvent>();
  private readonly conversationsSubject = new Subject<MessageEvent>();
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly prismaService: PrismaService,
  ) {
    this.prismaService.dbMutations$.subscribe(async (mutation) => {
      const { model, operation, data } = mutation;
      await this.emitEvent(model, operation, data);
    });
  }

  async emitEvent(model: string, action: string, data: any) {
    const formattedData = await this.getFormattedData(model, data);
    switch (model) {
      case EventSubjectType.ORGANIZATION:
        this.organizationSubject.next({
          id: data.id,
          data: formattedData,
          type: `${model}.${action}`,
          retry: 3000,
        });
        break;

      case EventSubjectType.WORKFLOW:
        this.workflowSubject.next({
          id: data.id,
          data: formattedData,
          type: `${model}.${action}`,
          retry: 3000,
        });
        break;

      case EventSubjectType.CONVERSATION:
      case EventSubjectType.MESSAGE:
        this.conversationsSubject.next({
          id: data.id,
          data: formattedData,
          type: `${model}.${action}`,
          retry: 3000,
        });
        break;

      default:
        break;
    }
  }

  async getFormattedData(model: string, data: any): Promise<any> {
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
          customMaxWorkflows: data.customMaxWorkflows,
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
          avgExecutionTime: data.avgExecutionTime,
          organizationId: data.organizationId,
        };
      case EventSubjectType.CONVERSATION:
        return await this.conversationsService.findAll(data.organizationId);
      case EventSubjectType.MESSAGE:
        const conversation = await this.prismaService.conversation.findFirst({
          where: {
            id: data.conversationId,
          },
          select: {
            title: true,
            channel: true,
            status: true,
            isHumanInTheLoop: true,
            messageCount: true,
            lastMessageAt: true,
            createdAt: true,
            closedAt: true,
            workflowId: true,
            userId: true,
            endUserId: true,
            organizationId: true,
          },
        });
        return conversation as DashboardConversationDto;
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
