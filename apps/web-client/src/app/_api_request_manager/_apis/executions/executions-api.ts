import ApiRequestManager from '../../api_request_manager';
import { ApiResponse } from '../../api_response.model';
import { PaginatedResponse } from '@/app/_model/common.dto';
import {
  DashboardExecutionDataDto,
  ExecutionsStatsDto,
  ExecutionDto,
} from '@/app/_model/executions.dto';

class ExecutionsApi {
  public apiRequestManager: ApiRequestManager;
  public static BASE_URL = '/executions';

  constructor() {
    this.apiRequestManager = ApiRequestManager.getInstance();
  }

  /**
   * Get dashboard data with cursor pagination
   * Endpoint: GET /executions/dashboards
   */
  public async getDashboardData(
    params: {
      cursor?: string | null;
      pageSize?: number;
      action?: 'next' | 'prev' | null;
      workflowId?: string;
      userId?: string;
      startDate?: Date;
      endDate?: Date;
      status?: string;
      trigger?: string;
    } = {}
  ): Promise<PaginatedResponse<DashboardExecutionDataDto>> {
    const queryParams = new URLSearchParams();
    if (params.cursor) queryParams.append('cursor', params.cursor);
    if (params.pageSize) queryParams.append('pageSize', params.pageSize.toString());
    if (params.action) queryParams.append('action', params.action);
    if (params.workflowId) queryParams.append('workflowId', params.workflowId);
    if (params.userId) queryParams.append('userId', params.userId);
    if (params.startDate) queryParams.append('startDate', params.startDate.toISOString());
    if (params.endDate) queryParams.append('endDate', params.endDate.toISOString());
    if (params.status) queryParams.append('status', params.status);
    if (params.trigger) queryParams.append('trigger', params.trigger);

    const queryString = queryParams.toString();
    const url = `${ExecutionsApi.BASE_URL}/dashboard${queryString ? `?${queryString}` : ''}`;

    const result =
      await this.apiRequestManager.get<ApiResponse<PaginatedResponse<DashboardExecutionDataDto>>>(
        url
      );

    if (!result.data.data) {
      throw new Error('No data received from dashboard execution endpoint');
    }

    return result.data.data;
  }

  /**
   * Get dashboard stats
   * Endpoint: GET /executions/stats
   */
  public async getStats(
    period: '24h' | '7d' | '30d' | '90d' | 'all' = '30d'
  ): Promise<ExecutionsStatsDto | null> {
    const queryParams = new URLSearchParams();
    queryParams.append('period', period);

    const result = await this.apiRequestManager.get<ApiResponse<ExecutionsStatsDto>>(
      `${ExecutionsApi.BASE_URL}/stats?${queryParams.toString()}`
    );
    return result.data.data ?? null;
  }

  /**
   * Get execution by ID
   * Endpoint: GET /executions/:id
   */
  public async getById(id: string): Promise<ExecutionDto | null> {
    const result = await this.apiRequestManager.get<ApiResponse<ExecutionDto>>(
      `${ExecutionsApi.BASE_URL}/${id}`
    );
    return result.data.data ?? null;
  }

  /**
   * Cancel Execution
   * Endpoint: POST /executions/:id/cancel
   */
  public async cancel(id: string): Promise<ExecutionDto | null> {
    const result = await this.apiRequestManager.post<ApiResponse<ExecutionDto>>(
      `${ExecutionsApi.BASE_URL}/${id}/cancel`
    );
    return result.data.data ?? null;
  }

  /**
   * Remove Execution
   * Endpoint: DELETE /executions/:id
   */
  public async remove(id: string): Promise<boolean> {
    const result = await this.apiRequestManager.delete<ApiResponse<void>>(
      `${ExecutionsApi.BASE_URL}/${id}`
    );
    return result.data.success;
  }
}

export default ExecutionsApi;
