import { CursorPaginatedResponse } from '@workflow-automation/shared-types';
import { DashboardCreditTransactionDto } from './dashboard-credit-transaction.dto';

export interface DashboardCreditsDto {
  id: string;
  balance: number;
  currentMonthSpent: number;
  creditTransactions: CursorPaginatedResponse<DashboardCreditTransactionDto>;
}
