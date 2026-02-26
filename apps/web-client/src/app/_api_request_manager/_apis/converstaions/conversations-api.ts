import ApiRequestManager from '../../api_request_manager';
import {
  ConversationDto,
  DashboardConversationDto,
  UpdateConversationDto,
  ConversationsStatsDto,
  ConversationDetailDto,
} from '@/app/_model/conversations.dto';
import { PaginatedResponse } from '@/app/_model/common.dto';
import { ApiResponse } from '../../api_response.model';

class ConversationsApi {
  public apiRequestManager: ApiRequestManager;
  private static BASE_URL = '/conversations';

  constructor() {
    this.apiRequestManager = ApiRequestManager.getInstance();
  }

  /**
   * Get dashboard conversations with cursor pagination
   * Endpoint: GET /conversations/dashboard
   */
  public async getDashboardData(
    cursor: string | null = null,
    pageSize: number = 10,
    action: 'next' | 'prev' | null = null,
    workflowId?: string,
    userId?: string
  ): Promise<PaginatedResponse<DashboardConversationDto>> {
    const queryParams = new URLSearchParams();
    if (cursor) queryParams.append('cursor', cursor);
    queryParams.append('pageSize', pageSize.toString());
    if (action) queryParams.append('action', action);
    if (workflowId) queryParams.append('workflowId', workflowId);
    if (userId) queryParams.append('userId', userId);

    const result = await this.apiRequestManager.get<
      ApiResponse<PaginatedResponse<DashboardConversationDto>>
    >(`${ConversationsApi.BASE_URL}/dashboard?${queryParams.toString()}`);
    // Ensure we handle the potentially nested response structure correctly
    // Based on ApiResponse definition: { success: boolean, data: T | null, ... }
    return result.data.data as PaginatedResponse<DashboardConversationDto>;
  }

  /**
   * Get dashboard stats
   * Endpoint: GET /conversations/stats
   */
  public async getStats(): Promise<ConversationsStatsDto | null> {
    const result = await this.apiRequestManager.get<ApiResponse<ConversationsStatsDto>>(
      `${ConversationsApi.BASE_URL}/stats`
    );
    return result.data.data ?? null;
  }

  /**
   * Get conversation by ID
   * Endpoint: GET /conversations/:id
   */
  public async getById(id: string): Promise<ConversationDetailDto | null> {
    const result = await this.apiRequestManager.get<ApiResponse<ConversationDetailDto>>(
      `${ConversationsApi.BASE_URL}/${id}`
    );
    return result.data.data ?? null;
  }

  /**
   * Update conversation
   * Endpoint: PATCH /conversations/:id
   */
  public async update(id: string, dto: UpdateConversationDto): Promise<ConversationDto | null> {
    const result = await this.apiRequestManager.patch<ApiResponse<ConversationDto>>(
      `${ConversationsApi.BASE_URL}/${id}`,
      dto
    );
    return result.data.data ?? null;
  }

  /**
   * Remove conversation
   * Endpoint: DELETE /conversations/:id
   */
  public async remove(id: string): Promise<boolean> {
    const result = await this.apiRequestManager.delete<ApiResponse<any>>(
      `${ConversationsApi.BASE_URL}/${id}`
    );
    return result.data.success;
  }
}

export default ConversationsApi;
