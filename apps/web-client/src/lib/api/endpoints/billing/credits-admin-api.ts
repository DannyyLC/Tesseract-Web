import ApiRequestManager from '../../api-request-manager';
import type { ApiResponse } from '@tesseract/types';

export interface AdminCreditTransaction {
  id: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  workflowCategory?: string | null;
  description?: string | null;
  createdAt: string;
  executionId?: string | null;
  invoiceId?: string | null;
}

export interface AdminCreditsDashboard {
  id: string;
  balance: number;
  currentMonthSpent: number;
  creditTransactions: {
    items: AdminCreditTransaction[];
    nextPageAvailable: boolean;
    nextCursor: string | null;
    prevCursor: string | null;
    pageSize: number;
  };
}

export interface AdjustAdminCreditsInput {
  amount: number;
  reason: string;
}

class CreditsAdminApi {
  public apiRequestManager: ApiRequestManager;
  private static BASE_URL = '/admin/organizations';

  constructor() {
    this.apiRequestManager = ApiRequestManager.getInstance();
  }

  public async getDashboard(
    organizationId: string,
    cursor?: string,
    direction?: 'next' | 'prev',
  ): Promise<AdminCreditsDashboard> {
    const params = new URLSearchParams();
    if (cursor) params.append('cursor', cursor);
    if (direction) params.append('direction', direction);
    const qs = params.toString();

    const result = await this.apiRequestManager.get<ApiResponse<AdminCreditsDashboard>>(
      `${CreditsAdminApi.BASE_URL}/${organizationId}/credits${qs ? `?${qs}` : ''}`,
    );
    return result.data.data!;
  }

  public async adjust(
    organizationId: string,
    data: AdjustAdminCreditsInput,
  ): Promise<AdminCreditsDashboard> {
    const result = await this.apiRequestManager.post<ApiResponse<AdminCreditsDashboard>>(
      `${CreditsAdminApi.BASE_URL}/${organizationId}/credits/adjust`,
      data,
    );
    return result.data.data!;
  }
}

export default CreditsAdminApi;
