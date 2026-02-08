import { DashboardInvoiceDto } from '@/invoice/dto/dashboard-invoice.dto';
import { Inject, Injectable, MessageEvent } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { ApiKeyResponseDto } from '../../api-keys/dto/response-api-key.dto';
import { DashboardConversationDto } from '../../conversations/dto';
import { DashboardCreditTransactionDto } from '../../credits/dto/dashboard-credit-transaction.dto';
import { DashboardCreditsDto } from '../../credits/dto/dashboard-credits.dto';
import { PrismaService } from '../../database/prisma.service';
import { DashboardEndUserDto } from '../../end-users/dto/dashboard-end-user.dto';
import { DashboardExecutionDto } from '../../executions/dto';
import { DashboardOrganizationDto, DashboardSubscriptionDto } from '../../organizations/dto';
import { OrganizationsService } from '../../organizations/organizations.service';
import { DashboardUserDataDto } from '../../users/dto';
import { UtilityService } from '../../utility/utility.service';
import { DashboardWorkflowDto } from '../../workflows/dto';
import { NotificationEventDto } from '../app-notifications/notification.dto';
import { notificationsEnum } from '../app-notifications/notifications.enum';
import { EventSubjectType } from '../utils/subjects-enum';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

@Injectable()
export class EventsService {
  private readonly organizationSubject = new Subject<MessageEvent>();
  private readonly workflowSubject = new Subject<MessageEvent>();
  private readonly conversationsSubject = new Subject<MessageEvent>();
  private readonly userSubject = new Subject<MessageEvent>();
  private readonly creditBalanceSubject = new Subject<MessageEvent>();
  private readonly creditTransactionsSubject = new Subject<MessageEvent>();
  private readonly endUserSubject = new Subject<MessageEvent>();
  private readonly executionSubject = new Subject<MessageEvent>();
  private readonly apiKeysSubject = new Subject<MessageEvent>();
  private readonly invoiceSubject = new Subject<MessageEvent>();
  private readonly llmModelSubject = new Subject<MessageEvent>();
  private readonly subscriptionSubject = new Subject<MessageEvent>();

  constructor(
    private readonly utilityService: UtilityService,
    private readonly organizationsService: OrganizationsService,
    private readonly prismaService: PrismaService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {
    this.prismaService.dbMutations$.subscribe(async (mutation) => {
      const { model, operation, data } = mutation;
      await this.emitEvent(model, operation, data);
    });
  }

  async emitEvent(model: string, action: string, data: any) {
    if (
      action === 'upsertd' ||
      action === 'updateManyd' ||
      action === 'deleteManyd' ||
      action === 'createManyd'
    ) {
      return;
    }

    const formattedData = await this.getFormattedData(model, data);
    switch (model) {
      case EventSubjectType.API_KEY:
        this.apiKeysSubject.next({
          id: data.id,
          data: formattedData,
          type: `${model}.${action}`,
          retry: 3000,
        });
        break;
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
      case EventSubjectType.USER:
        this.userSubject.next({
          id: data.id,
          data: formattedData,
          type: `${model}.${action}`,
          retry: 3000,
        });
        break;
      case EventSubjectType.CREDIT_BALANCE:
        this.creditBalanceSubject.next({
          id: data.organizationId,
          data: formattedData,
          type: `${model}.${action}`,
          retry: 3000,
        });
        break;
      case EventSubjectType.CREDIT_TRANSACTION:
        this.creditTransactionsSubject.next({
          id: data.organizationId,
          data: formattedData,
          type: `${model}.${action}`,
          retry: 3000,
        });
        break;
      case EventSubjectType.END_USER:
        this.endUserSubject.next({
          id: data.id,
          data: formattedData,
          type: `${model}.${action}`,
          retry: 3000,
        });
        break;
      case EventSubjectType.EXECUTION:
        this.executionSubject.next({
          id: data.id,
          data: formattedData,
          type: `${model}.${action}`,
          retry: 3000,
        });
        break;

      case EventSubjectType.INVOICE:
        this.invoiceSubject.next({
          id: data.id,
          data: formattedData,
          type: `${model}.${action}`,
          retry: 3000,
        });
        break;

      case EventSubjectType.LLM_MODEL:
        this.llmModelSubject.next({
          id: data.id,
          data: formattedData,
          type: `${model}.${action}`,
          retry: 3000,
        });
        break;

      case EventSubjectType.SUBSCRIPTION:
        this.subscriptionSubject.next({
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
          subscriptionData: await this.organizationsService.getSubscriptionData(data.id),
        } as DashboardOrganizationDto;

      case EventSubjectType.WORKFLOW:
        return {
          id: data.id,
          name: data.name,
          description: data.description,
          isActive: data.isActive,
          category: data.category,
          lastExecutedAt: data.lastExecutedAt,
          organizationId: data.organizationId,
        } as DashboardWorkflowDto & { organizationId: string };
      case EventSubjectType.CONVERSATION:
        return {
          id: data.id,
          title: data.title,
          channel: data.channel,
          status: data.status,
          isHumanInTheLoop: data.isHumanInTheLoop,
          messageCount: data.messageCount,
          lastMessageAt: data.lastMessageAt,
          closedAt: data.closedAt,
          workflowId: data.workflowId,
          userId: data.userId,
          organizationId: data.organizationId,
        } as DashboardConversationDto;
      case EventSubjectType.MESSAGE:
        const conversation = await this.prismaService.conversation.findFirst({
          where: {
            id: data.conversationId,
          },
          select: {
            id: true,
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

      case EventSubjectType.USER:
        return {
          id: data.id,
          email: data.email,
          name: data.name,
          role: data.role,
          isActive: data.isActive,
          createdAt: data.createdAt,
          organizationId: data.organizationId,
          lastLoginAt: data.lastLoginAt,
          avatar: data.avatar,
          timezone: data.timezone,
          emailVerified: data.emailVerified,
        } as DashboardUserDataDto;
      case EventSubjectType.CREDIT_BALANCE:
        return {
          id: data.organizationId,
          balance: data.balance,
          currentMonthSpent: data.currentMonthSpent,
          organizationId: data.organizationId,
        } as DashboardCreditsDto & { organizationId: string };

      case EventSubjectType.CREDIT_TRANSACTION:
        return {
          id: data.id,
          type: data.type,
          amount: data.amount,
          balanceBefore: data.balanceBefore,
          balanceAfter: data.balanceAfter,
          workflowCategory: data.workflowCategory,
          description: data.description,
          createdAt: data.createdAt,
          executionId: data.executionId,
          invoiceId: data.invoiceId,
          organizationId: data.organizationId,
        } as DashboardCreditTransactionDto & { organizationId: string };

      case EventSubjectType.END_USER:
        return {
          id: data.id,
          phoneNumber: data.phoneNumber,
          email: data.email,
          externalId: data.externalId,
          name: data.name,
          avatar: data.avatar,
          metadata: data.metadata,
          lastSeenAt: data.lastSeenAt,
          createdAt: data.createdAt,
          organizationId: data.organizationId,
        } as DashboardEndUserDto & { organizationId: string };

      case EventSubjectType.EXECUTION:
        return {
          id: data.id,
          status: data.status,
          startedAt: data.startedAt,
          finishedAt: data.finishedAt,
          duration: data.duration,
          trigger: data.trigger,
          credits: data.credits,
          workflowId: data.workflowId,
          workflowName: data.workflowName,
          userId: data.userId,
          userName: data.userName,
        } as DashboardExecutionDto & { organizationId: string };

      case EventSubjectType.API_KEY:
        return {
          id: data.id,
          name: data.name,
          description: data.description,
          apiKey: data.apiKey,
          isActive: data.isActive,
          workflowId: data.workflowId,
          expiresAt: data.expiresAt,
          lastUsedAt: data.lastUsedAt,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          organizationId: data.organizationId,
        } as ApiKeyResponseDto & { organizationId: string };

      case EventSubjectType.INVOICE:
        return {
          id: data.id,
          invoiceNumber: data.invoiceNumber,
          type: data.type,
          status: data.status,
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
          subtotal: data.subtotal,
          overageAmount: data.overageAmount,
          tax: data.tax,
          total: data.total,
          stripeHostedUrl: data.stripeHostedUrl,
          stripePdfUrl: data.stripePdfUrl,
          paidAt: data.paidAt,
          dueAt: data.dueAt,
          organizationId: data.organizationId,
        } as DashboardInvoiceDto & { organizationId: string };

      case EventSubjectType.SUBSCRIPTION:
        return {
          id: data.id,
          plan: data.plan,
          status: data.status,
          currentPeriodStart: data.currentPeriodStart,
          currentPeriodEnd: data.currentPeriodEnd,
          cancelAtPeriodEnd: data.cancelAtPeriodEnd,
          customMonthlyPrice: data.customMonthlyPrice,
          customMonthlyCredits: data.customMonthlyCredits,
          customMaxWorkflows: data.customMaxWorkflows,
          customFeatures: data.customFeatures,
          organizationId: data.organizationId,
        } as DashboardSubscriptionDto & { organizationId: string };
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

  getUserStream(): Observable<MessageEvent> {
    return this.userSubject.asObservable();
  }

  getCreditBalanceStream(): Observable<MessageEvent> {
    return this.creditBalanceSubject.asObservable();
  }

  getCreditTransactionsStream(): Observable<MessageEvent> {
    return this.creditTransactionsSubject.asObservable();
  }

  getEndUserStream(): Observable<MessageEvent> {
    return this.endUserSubject.asObservable();
  }

  getExecutionStream(): Observable<MessageEvent> {
    return this.executionSubject.asObservable();
  }

  getApiKeysStream(): Observable<MessageEvent> {
    return this.apiKeysSubject.asObservable();
  }

  getInvoiceStream(): Observable<MessageEvent> {
    return this.invoiceSubject.asObservable();
  }

  getLlmModelStream(): Observable<MessageEvent> {
    return this.llmModelSubject.asObservable();
  }

  getSubscriptionStream(): Observable<MessageEvent> {
    return this.subscriptionSubject.asObservable();
  }

  getAppNotificationsStream(): Observable<MessageEvent> {
    return this.utilityService.getAppNotificationsSubject().asObservable();
  }

}
