import { unwrapData } from '@/lib/api/unwrap-data';
import ApiRequestManager from '../../../api-request-manager';
import {
  DashboardUserDataDto,
  UpdateUserDto,
  ApiResponse,
  PaginatedResponse,
} from '@tesseract/types';

/** `GET /users/stats` (`UsersService.getStats`). */
export interface UserStats {
  total: number;
  byRole: { viewer: number; admin: number; owner: number };
  active: number;
  inactive: number;
  verified: number;
  unverified: number;
  pendingInvitations?: number;
}

/** `GET /users/pending-invitations`. */
export interface PendingInvitation {
  email: string;
  expiresAt: string;
  createdAt: string;
}

class UsersApi {
  public apiRequestManager: ApiRequestManager;
  private static BASE_URL = '/users';

  constructor() {
    this.apiRequestManager = ApiRequestManager.getInstance();
  }

  /**
   * Get dashboard data with cursor pagination
   */
  public async getDashboardData(
    params: {
      cursor?: string | null;
      pageSize?: number;
      action?: 'next' | 'prev' | null;
      search?: string;
      role?: string;
      isActive?: boolean;
    } = {},
  ): Promise<PaginatedResponse<DashboardUserDataDto>> {
    const queryParams = new URLSearchParams();
    if (params.cursor) queryParams.append('cursor', params.cursor);
    if (params.pageSize) queryParams.append('pageSize', params.pageSize.toString());
    if (params.action) queryParams.append('action', params.action);
    if (params.search) queryParams.append('search', params.search);
    if (params.role) queryParams.append('role', params.role);
    if (params.isActive !== undefined) queryParams.append('isActive', params.isActive.toString());

    const queryString = queryParams.toString();
    const url = `${UsersApi.BASE_URL}/dashboard${queryString ? `?${queryString}` : ''}`;

    const result =
      await this.apiRequestManager.get<ApiResponse<PaginatedResponse<DashboardUserDataDto>>>(url);
    return unwrapData(result);
  }

  /**
   * Get user statistics
   */
  public async getStats(): Promise<UserStats> {
    const result = await this.apiRequestManager.get<ApiResponse<UserStats>>(
      `${UsersApi.BASE_URL}/stats`,
    );
    return unwrapData(result);
  }

  /**
   * Get a user by ID
   */
  public async findOne(id: string): Promise<DashboardUserDataDto> {
    const result = await this.apiRequestManager.get<ApiResponse<DashboardUserDataDto>>(
      `${UsersApi.BASE_URL}/${id}`,
    );
    return unwrapData(result);
  }

  /**
   * Update a user
   */
  public async update(id: string, data: UpdateUserDto): Promise<DashboardUserDataDto> {
    const result = await this.apiRequestManager.patch<ApiResponse<DashboardUserDataDto>>(
      `${UsersApi.BASE_URL}/${id}/update-status-or-role`,
      data,
    );
    return unwrapData(result);
  }

  /**
   * Delete a user
   */
  public async remove(id: string): Promise<void> {
    await this.apiRequestManager.delete<ApiResponse<void>>(`${UsersApi.BASE_URL}/${id}`);
  }

  /**
   * Transfer ownership to a user
   */
  public async transferOwnership(id: string): Promise<void> {
    await this.apiRequestManager.patch<ApiResponse<void>>(
      `${UsersApi.BASE_URL}/${id}/transfer-ownership`,
      {},
    );
  }

  /**
   * Leave organization
   */
  public async leaveOrganization(data: {
    confirmationText: string;
    code2FA?: string;
  }): Promise<{ message: string }> {
    const result = await this.apiRequestManager.delete<ApiResponse<{ message: string }>>(
      `${UsersApi.BASE_URL}/me/organization`,
      { data },
    );
    return unwrapData(result);
  }

  public async getPendingInvitations(): Promise<PendingInvitation[]> {
    const result = await this.apiRequestManager.get<ApiResponse<PendingInvitation[]>>(
      `${UsersApi.BASE_URL}/pending-invitations`,
    );
    return unwrapData(result);
  }
}

export default UsersApi;
