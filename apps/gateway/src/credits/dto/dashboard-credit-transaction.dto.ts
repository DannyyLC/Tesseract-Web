import { TransactionType } from '@tesseract/database';

export interface DashboardCreditTransactionDto {
  id: string;
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
