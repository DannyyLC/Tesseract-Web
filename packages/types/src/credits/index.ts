// ============================================================
// Credits — Shared types for credit balance and transactions
// ============================================================

export interface DashboardCreditsDto {
  id: string;
  balance: number;
  currentMonthSpent: number;
}

export interface DashboardCreditTransactionDto {
  id: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  workflowCategory?: string | null;
  description?: string | null;
  createdAt: Date;
  executionId?: string | null;
  invoiceId?: string | null;
}
