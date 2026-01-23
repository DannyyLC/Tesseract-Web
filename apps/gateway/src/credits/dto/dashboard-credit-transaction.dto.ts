import { TransactionType } from '@workflow-platform/database';

export interface DashboardCreditTransactionDto {
  type: TransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  workflowCategory?: string | null;
  description?: string | null;
  createdAt: Date;
  executionId?: string | null;
  invoiceId?: string | null;
}
