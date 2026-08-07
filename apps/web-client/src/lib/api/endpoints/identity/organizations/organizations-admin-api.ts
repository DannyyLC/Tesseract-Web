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
}

export default OrganizationsAdminApi;
