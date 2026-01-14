import { TransactionType } from "@workflow-platform/database";

export interface DashboardCreditTransactionDto {
  id: string;
  organizationId: string;
  type: TransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  workflowCategory?: string | null;
  costUSD?: number | null;
  description?: string | null;
  createdAt: Date;
  executionId?: string | null;
  invoiceId?: string | null;
}