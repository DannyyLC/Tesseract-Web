import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { WorkflowCategory, TransactionType } from '@prisma/client';
import { CursorPaginatedResponse, getWorkflowCreditCost } from '@workflow-automation/shared-types';
import { CreditBalance } from '@workflow-platform/database';
import { DashboardCreditsDto } from './dto/dashboard-credits.dto';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { DashboardCreditTransactionDto } from './dto/dashboard-credit-transaction.dto';
import { CursorPaginatedResponseUtils } from '../common/responses/cursor-paginated-response';
@Injectable()
export class CreditsService {
  constructor(
    private prisma: PrismaService,
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
        `create method >> Error creando credit balance para org ${organizationId}: ${error}`,
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

    const requiredCredits = getWorkflowCreditCost(workflowCategory);

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

    const credits = getWorkflowCreditCost(workflowCategory);
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
  }

  async getDashboardData(
    organizationId: string,
    cursor?: string | null,
    pageSize: number = 10,
    paginationAction?: 'next' | 'prev' | null,
  ): Promise<DashboardCreditsDto | null> {
    const balance = await this.prisma.creditBalance.findUnique({
      where: { organizationId },
      select: {
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
    pageSize: number = 10,
    paginationAction?: 'next' | 'prev' | null,
  ): Promise<CursorPaginatedResponse<DashboardCreditTransactionDto>> {
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

    const transformmedData = paginatedTransactions.items.map((ct) => {
      const { id, ...rest } = ct;
      return rest;
    });

    return {
      ...paginatedTransactions,
      items: transformmedData,
    };
  }
}
