import ApiRequestManager from '../../api_request_manager';
import { ApiResponse, CursorPaginatedResponse } from '../../api_response.model';
import { DashboardUserDataDto, UpdateUserDto } from '../../../_model/users.dto';

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
    } = {}
  ): Promise<CursorPaginatedResponse<DashboardUserDataDto>> {
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
      await this.apiRequestManager.get<ApiResponse<CursorPaginatedResponse<DashboardUserDataDto>>>(
        url
      );
    return result.data.data!;
  }

  /**
   * Get user statistics
   */
  public async getStats(): Promise<any> {
    // The return type is 'any' in the controller Response<any> (setData(stats))
    // The prompt provided DashboardUsersDto which might be the stats structure
    const result = await this.apiRequestManager.get<ApiResponse<any>>(`${UsersApi.BASE_URL}/stats`);
    return result.data.data;
  }

  /**
   * Get a user by ID
   */
  public async findOne(id: string): Promise<DashboardUserDataDto> {
    const result = await this.apiRequestManager.get<ApiResponse<DashboardUserDataDto>>(
      `${UsersApi.BASE_URL}/${id}`
    );
    return result.data.data!;
  }

  /**
   * Update a user
   */
  public async update(id: string, data: UpdateUserDto): Promise<DashboardUserDataDto> {
    const result = await this.apiRequestManager.patch<ApiResponse<DashboardUserDataDto>>(
      `${UsersApi.BASE_URL}/${id}`,
      data
    );
    return result.data.data!;
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
      {}
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
      { data }
    );
    return result.data.data!;
  }
}

export default UsersApi;
