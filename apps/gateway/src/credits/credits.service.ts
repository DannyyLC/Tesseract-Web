import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { WorkflowCategory, TransactionType, UserRole } from '@tesseract/database';
import {
  PaginatedResponse,
  getWorkflowCreditCost,
  getPlanLimits,
  NOTIFICATIONSENUM,
} from '@tesseract/types';
import { CreditBalance } from '@tesseract/database';
import { DashboardCreditsDto } from './dto/dashboard-credits.dto';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { DashboardCreditTransactionDto } from './dto/dashboard-credit-transaction.dto';
import { CursorPaginatedResponseUtils } from '../common/responses/cursor-paginated-response';
import { UtilityService } from '../utility/utility.service';

const LOW_CREDITS_THRESHOLD_PERCENTAGE = 0.2;
const OVERAGE_LIMIT_NOTIFICATION_COOLDOWN_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class CreditsService {
  constructor(
    private prisma: PrismaService,
    private readonly utilityService: UtilityService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  // ============================================
  // CREATE
  // ============================================
  /**
   * Crear creditBalance para una organizacion nueva
   */
  async create(organizationId: string): Promise<CreditBalance | null> {
    try {
      return await this.prisma.creditBalance.create({
        data: {
          organizationId: organizationId,
          balance: 0,
          lifetimeEarned: 0,
          lifetimeSpent: 0,
          currentMonthSpent: 0,
          currentMonthCostUSD: 0,
        },
      });
    } catch (error) {
      this.logger.error(
        `create method >> Error creando credit balance para org ${organizationId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Añadir créditos a una organización (Legacy/Suscripción/Compra)
   */
  async addCredits(
    organizationId: string,
    amount: number,
    type: TransactionType,
    description?: string,
    metadata?: Record<string, any>,
    costUSD?: number,
    subscriptionId?: string,
    invoiceId?: string,
  ): Promise<void> {
    const balance = await this.prisma.creditBalance.findUnique({
      where: { organizationId },
    });

    if (!balance) {
      throw new Error('Credit balance not found');
    }

    const balanceBefore = balance.balance;
    const balanceAfter = balanceBefore + amount;

    await this.prisma.$transaction([
      this.prisma.creditBalance.update({
        where: { organizationId },
        data: {
          balance: balanceAfter,
          lifetimeEarned: { increment: amount },
        },
      }),
      this.prisma.creditTransaction.create({
        data: {
          organizationId,
          type,
          amount,
          balanceBefore,
          balanceAfter,
          description,
          metadata: metadata ?? undefined,
          costUSD,
          subscriptionId,
          invoiceId,
        },
      }),
    ]);
  }

  /**
   * Validar si una organización puede ejecutar un workflow
   */
  async canExecuteWorkflow(
    organizationId: string,
    workflowCategory: WorkflowCategory,
  ): Promise<{ allowed: boolean; reason?: string }> {
    // Obtener balance y configuración de la org
    const [balance, org] = await Promise.all([
      this.prisma.creditBalance.findUnique({
        where: { organizationId },
      }),
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { allowOverages: true, overageLimit: true, plan: true },
      }),
    ]);

    if (!balance || !org) {
      return { allowed: false, reason: 'Organization or balance not found' };
    }

    const requiredCredits = getWorkflowCreditCost(workflowCategory as any);

    // Caso 1: Tiene créditos suficientes
    if (balance.balance >= requiredCredits) {
      return { allowed: true };
    }

    // Caso 2: No permite overages
    if (!org.allowOverages) {
      return {
        allowed: false,
        reason: `Insufficient credits (${balance.balance}/${requiredCredits}) and overages not allowed`,
      };
    }

    // Caso 3: Validar límite de overage
    const balanceAfter = balance.balance - requiredCredits;
    const overageLimit = org.overageLimit;

    if (overageLimit === null) {
      return {
        allowed: false,
        reason: 'Overage limit not configured',
      };
    }

    if (Math.abs(balanceAfter) <= overageLimit) {
      return { allowed: true };
    }

    const shouldNotifyOverageLimit = await this.shouldSendOverageLimitReachedNotification(
      organizationId,
    );

    if (shouldNotifyOverageLimit) {
      await this.utilityService.sendNotificationToAppClients(
        organizationId,
        [UserRole.OWNER, UserRole.ADMIN],
        NOTIFICATIONSENUM.OVERAGE_LIMIT_REACHED,
        [Math.abs(balanceAfter).toString(), overageLimit.toString()],
      );
    }

    return {
      allowed: false,
      reason: `Would exceed overage limit (${Math.abs(balanceAfter)}/${overageLimit})`,
    };
  }

  /**
   * Descontar créditos después de ejecutar un workflow
   */
  async deductCredits(
    organizationId: string,
    executionId: string,
    workflowId: string,
    workflowCategory: WorkflowCategory,
    workflowName: string,
    costUSD?: number,
    metadata?: Record<string, any>,
  ): Promise<void> {
    // Obtener balance actual
    const balance = await this.prisma.creditBalance.findUnique({
      where: { organizationId },
    });

    if (!balance) {
      throw new Error('Credit balance not found');
    }

    const credits = getWorkflowCreditCost(workflowCategory as any);
    const balanceBefore = balance.balance;
    const balanceAfter = balanceBefore - credits;

    // Transacción atómica para actualizar todo
    await this.prisma.$transaction([
      // 1. Actualizar CreditBalance
      this.prisma.creditBalance.update({
        where: { organizationId },
        data: {
          balance: balanceAfter,
          lifetimeSpent: { increment: credits },
          currentMonthSpent: { increment: credits },
          currentMonthCostUSD: { increment: costUSD ?? 0 },
        },
      }),

      // 2. Crear CreditTransaction
      this.prisma.creditTransaction.create({
        data: {
          organizationId,
          type: 'EXECUTION_DEDUCTION',
          amount: -credits,
          balanceBefore,
          balanceAfter,
          executionId,
          workflowCategory,
          costUSD: costUSD ?? undefined,
          description: `Execution of ${workflowCategory} workflow: ${workflowName}`,
          metadata: metadata ?? undefined,
        },
      }),

      // 3. Actualizar campos en Execution
      this.prisma.execution.update({
        where: { id: executionId },
        data: {
          credits,
          balanceBefore,
          balanceAfter,
          wasOverage: balanceAfter < 0,
        },
      }),

      // 4. Actualizar estadísticas del workflow
      this.prisma.workflow.update({
        where: { id: workflowId },
        data: {
          totalCreditsConsumed: { increment: credits },
        },
      }),
    ]);

    // 5. Calcular y actualizar promedio (fuera de transacción)
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { totalCreditsConsumed: true, totalExecutions: true },
    });

    if (workflow && workflow.totalExecutions > 0) {
      const avgCredits = workflow.totalCreditsConsumed / workflow.totalExecutions;
      await this.prisma.workflow.update({
        where: { id: workflowId },
        data: { avgCreditsPerExecution: avgCredits },
      });
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { plan: true },
    });

    if (organization) {
      const planMonthlyCredits = getPlanLimits(organization.plan as any).monthlyCredits;
      const lowCreditsThreshold = Math.max(
        1,
        Math.ceil(planMonthlyCredits * LOW_CREDITS_THRESHOLD_PERCENTAGE),
      );

      // ZERO_CREDITS solo al cruce por el 0 dentro del rango de la ejecucion.
      // Ejemplos: 5 -> 0, 2 -> -3 (ambos notifican); 0 -> -5 (no repite).
      const crossedZero = balanceBefore > 0 && balanceAfter <= 0;

      // CONSUMPTION_ALERT solo al cruce del umbral (20% del plan) y con saldo aun positivo.
      const crossedLowCreditsThreshold =
        balanceBefore > lowCreditsThreshold &&
        balanceAfter <= lowCreditsThreshold &&
        balanceAfter > 0;

      if (crossedZero) {
        await this.utilityService.sendNotificationToAppClients(
          organizationId,
          [UserRole.OWNER, UserRole.ADMIN],
          NOTIFICATIONSENUM.ZERO_CREDITS,
        );
      } else if (crossedLowCreditsThreshold) {
        await this.utilityService.sendNotificationToAppClients(
          organizationId,
          [UserRole.OWNER, UserRole.ADMIN],
          NOTIFICATIONSENUM.CONSUMPTION_ALERT,
          [balanceAfter.toString()],
        );
      }
    }
  }

  private async shouldSendOverageLimitReachedNotification(
    organizationId: string,
  ): Promise<boolean> {
    const latestNotification = await this.prisma.userNotification.findFirst({
      where: {
        organizationId,
        notification: {
          code: NOTIFICATIONSENUM.OVERAGE_LIMIT_REACHED,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        createdAt: true,
      },
    });

    if (!latestNotification) {
      return true;
    }

    const elapsedTimeMs = Date.now() - latestNotification.createdAt.getTime();
    return elapsedTimeMs >= OVERAGE_LIMIT_NOTIFICATION_COOLDOWN_MS;
  }

  async getDashboardData(
    organizationId: string,
    cursor?: string | null,
    pageSize = 10,
    paginationAction?: 'next' | 'prev' | null,
  ): Promise<DashboardCreditsDto | null> {
    const balance = await this.prisma.creditBalance.findUnique({
      where: { organizationId },
      select: {
        id: true,
        balance: true,
        currentMonthSpent: true,
      },
    });
    if (!balance) {
      this.logger.error(
        `getDashboardData method >> No credit balance found for organization ${organizationId}`,
      );
      return null;
    }
    this.logger.info(
      `getDashboardData method >> Retrieved credit balance for organization ${organizationId}: ${JSON.stringify(balance)}`,
    );
    return {
      ...balance,
      creditTransactions: await this.getCreditTransactionsForOrganization(
        organizationId,
        cursor,
        pageSize,
        paginationAction,
      ),
    };
  }

  async getCreditTransactionsForOrganization(
    organizationId: string,
    cursor?: string | null,
    pageSize = 10,
    paginationAction?: 'next' | 'prev' | null,
  ): Promise<PaginatedResponse<DashboardCreditTransactionDto>> {
    const creditTransactions = await this.prisma.creditTransaction.findMany({
      where: { organizationId },
      take:
        paginationAction === 'next' || paginationAction === null ? pageSize + 1 : -(pageSize + 1),
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      select: {
        id: true,
        type: true,
        amount: true,
        balanceBefore: true,
        balanceAfter: true,
        workflowCategory: true,
        description: true,
        createdAt: true,
        executionId: true,
        invoiceId: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    const paginatedTransactions = await CursorPaginatedResponseUtils.getInstance().build(
      creditTransactions,
      pageSize,
      paginationAction,
    );

    return paginatedTransactions;
  }
}
