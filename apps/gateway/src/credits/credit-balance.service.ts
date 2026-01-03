import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { WorkflowCategory } from '@prisma/client';
import { getWorkflowCreditCost } from '@workflow-automation/shared-types';


@Injectable()
export class CreditBalanceService {
  constructor(private prisma: PrismaService) {}

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
          description: `Execution of ${workflowCategory} workflow: ${workflowName}`,
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
      const avgCredits =
        workflow.totalCreditsConsumed / workflow.totalExecutions;
      await this.prisma.workflow.update({
        where: { id: workflowId },
        data: { avgCreditsPerExecution: avgCredits },
      });
    }
  }
}
