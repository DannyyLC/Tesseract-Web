import ApiRequestManager from '@/lib/api/api-request-manager';
import type { ApiResponse } from '@tesseract/types';

export interface AdminOrganization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  isActive: boolean;
  createdAt: string;
  _count: { workflows: number };
}

export interface AdminOrganizationsQuery {
  search?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface AdminOrganizationsResult {
  data: AdminOrganization[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface AdminOrganizationDetail {
  id: string;
  name: string;
  slug: string;
  plan: string;
  isActive: boolean;
  createdAt: string;
  deactivatedAt: string | null;
  deactivationReason: string | null;
  allowOverages: boolean;
  overageLimit: number | null;
  customMaxUsers: number | null;
  customMaxApiKeys: number | null;
  customMaxWorkflows: number | null;
  customMaxDatasets: number | null;
  customMaxDatasetRows: number | null;
  subscription: {
    plan: string;
    status: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
    stripeSubscriptionId: string | null;
  } | null;
  planLimits: {
    limits: {
      maxUsers: number;
      maxApiKeys: number;
      maxWorkflows: number;
      maxDatasets: number;
      maxDatasetRows: number;
      monthlyCredits: number;
      overageLimit: number;
    };
  };
  usage: { users: number; workflows: number; apiKeys: number };
}

export interface UpdateAdminCustomLimitsInput {
  customMaxUsers?: number;
  customMaxApiKeys?: number;
  customMaxWorkflows?: number;
  customMaxDatasets?: number;
  customMaxDatasetRows?: number;
}

export interface ToggleAdminOverageInput {
  allowOverages: boolean;
  overageLimit?: number;
}

class OrganizationsAdminApi {
  public apiRequestManager: ApiRequestManager;
  private static BASE_URL = '/admin/organizations';

  constructor() {
    this.apiRequestManager = ApiRequestManager.getInstance();
  }

  public async findAll(query: AdminOrganizationsQuery = {}): Promise<AdminOrganizationsResult> {
    const params = new URLSearchParams();
    if (query.search) params.append('search', query.search);
    if (query.isActive !== undefined) params.append('isActive', String(query.isActive));
    if (query.page) params.append('page', String(query.page));
    if (query.limit) params.append('limit', String(query.limit));

    const qs = params.toString();
    const result = await this.apiRequestManager.get<ApiResponse<AdminOrganizationsResult>>(
      `${OrganizationsAdminApi.BASE_URL}${qs ? `?${qs}` : ''}`,
    );
    return result.data.data!;
  }

  public async findOne(id: string): Promise<AdminOrganizationDetail> {
    const result = await this.apiRequestManager.get<ApiResponse<AdminOrganizationDetail>>(
      `${OrganizationsAdminApi.BASE_URL}/${id}`,
    );
    return result.data.data!;
  }

  public async updateCustomLimits(
    id: string,
    data: UpdateAdminCustomLimitsInput,
  ): Promise<AdminOrganizationDetail> {
    const result = await this.apiRequestManager.patch<ApiResponse<AdminOrganizationDetail>>(
      `${OrganizationsAdminApi.BASE_URL}/${id}/custom-limits`,
      data,
    );
    return result.data.data!;
  }

  public async toggleOverage(
    id: string,
    data: ToggleAdminOverageInput,
  ): Promise<AdminOrganizationDetail> {
    const result = await this.apiRequestManager.patch<ApiResponse<AdminOrganizationDetail>>(
      `${OrganizationsAdminApi.BASE_URL}/${id}/overage`,
      data,
    );
    return result.data.data!;
  }

  public async deactivate(id: string, reason?: string): Promise<AdminOrganizationDetail> {
    const result = await this.apiRequestManager.post<ApiResponse<AdminOrganizationDetail>>(
      `${OrganizationsAdminApi.BASE_URL}/${id}/deactivate`,
      { reason },
    );
    return result.data.data!;
  }

  public async reactivate(id: string): Promise<AdminOrganizationDetail> {
    const result = await this.apiRequestManager.post<ApiResponse<AdminOrganizationDetail>>(
      `${OrganizationsAdminApi.BASE_URL}/${id}/reactivate`,
      {},
    );
    return result.data.data!;
  }
}

export default OrganizationsAdminApi;
