import { DashboardCreditTransactionDto } from './dashboard-credit-transaction.dto';

export interface DashboardCreditsDto {
  id: string;
  organizationId: string;
  balance: number;
  currentMonthSpent: number;
  creditTransactions: DashboardCreditTransactionDto[];
}
