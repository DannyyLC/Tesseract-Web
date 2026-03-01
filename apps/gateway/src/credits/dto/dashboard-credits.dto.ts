import { PaginatedResponse } from '@tesseract/types';
import { DashboardCreditTransactionDto } from './dashboard-credit-transaction.dto';

export interface DashboardCreditsDto {
  id: string;
  balance: number;
  currentMonthSpent: number;
  creditTransactions: PaginatedResponse<DashboardCreditTransactionDto>;
}
