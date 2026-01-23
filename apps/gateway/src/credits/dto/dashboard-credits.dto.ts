import { DashboardCreditTransactionDto } from './dashboard-credit-transaction.dto';

export interface DashboardCreditsDto {
  balance: number;
  currentMonthSpent: number;
  creditTransactions: DashboardCreditTransactionDto[];
}
