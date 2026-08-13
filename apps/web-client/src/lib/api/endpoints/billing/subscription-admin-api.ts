import ApiRequestManager from '../../api-request-manager';
import type { ApiResponse } from '@tesseract/types';

export interface UpdateAdminSubscriptionInput {
  plan?: string;
  status?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
}

class SubscriptionAdminApi {
  public apiRequestManager: ApiRequestManager;
  private static BASE_URL = '/admin/organizations';

  constructor() {
    this.apiRequestManager = ApiRequestManager.getInstance();
  }

  public async update(organizationId: string, data: UpdateAdminSubscriptionInput): Promise<void> {
    await this.apiRequestManager.put<ApiResponse<null>>(
      `${SubscriptionAdminApi.BASE_URL}/${organizationId}/subscription`,
      data,
    );
  }
}

export default SubscriptionAdminApi;
