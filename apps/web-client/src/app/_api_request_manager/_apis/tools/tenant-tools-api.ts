import ApiRequestManager from '../../api_request_manager';
import {
  CreateTenantToolDto,
  DashboardTenantToolDto,
  UpdateTenantToolDto,
  WorkflowIdsDto,
  PaginatedResponse,
  ApiResponse,
} from '@tesseract/types';

class TenantToolsApi {
  public apiRequestManager: ApiRequestManager;
  private static BASE_URL = '/tenant-tool';

  constructor() {
    this.apiRequestManager = ApiRequestManager.getInstance();
  }

  /**
   * Dashboard de tenant tools con cursor pagination.
   * Endpoint: GET /tenant-tool/dashboard
   */
  public async getDashboardData(
    params: {
      cursor?: string | null;
      pageSize?: number;
      action?: 'next' | 'prev' | null;
    } = {},
  ): Promise<PaginatedResponse<DashboardTenantToolDto>> {
    const queryParams = new URLSearchParams();

    if (params.cursor) queryParams.append('cursor', params.cursor);
    if (params.pageSize) queryParams.append('pageSize', params.pageSize.toString());
    if (params.action) queryParams.append('action', params.action);

    const queryString = queryParams.toString();
    const url = `${TenantToolsApi.BASE_URL}/dashboard${queryString ? `?${queryString}` : ''}`;

    const result =
      await this.apiRequestManager.get<ApiResponse<PaginatedResponse<DashboardTenantToolDto>>>(url);

    if (!result.data.data) {
      throw new Error('No data received from tenant tool dashboard endpoint');
    }

    return result.data.data;
  }

  /**
   * Obtiene un tenant tool por ID.
   * Endpoint: GET /tenant-tool/:id
   */
  public async getById(id: string): Promise<DashboardTenantToolDto | null> {
    const result = await this.apiRequestManager.get<ApiResponse<DashboardTenantToolDto>>(
      `${TenantToolsApi.BASE_URL}/${id}`,
    );
    return result.data.data ?? null;
  }

  /**
   * Crea un nuevo tenant tool.
   * Endpoint: POST /tenant-tool/create
   */
  public async create(data: CreateTenantToolDto): Promise<CreateTenantToolDto | null> {
    const result = await this.apiRequestManager.post<ApiResponse<CreateTenantToolDto>>(
      `${TenantToolsApi.BASE_URL}/create`,
      data,
    );
    return result.data.data ?? null;
  }

  /**
   * Actualiza el displayName de un tenant tool.
   * Endpoint: PUT /tenant-tool/update/:id
   */
  public async update(id: string, data: UpdateTenantToolDto): Promise<UpdateTenantToolDto | null> {
    const result = await this.apiRequestManager.put<ApiResponse<UpdateTenantToolDto>>(
      `${TenantToolsApi.BASE_URL}/update/${id}`,
      data,
    );
    return result.data.data ?? null;
  }

  /**
   * Asocia workflows a un tenant tool.
   * Endpoint: POST /tenant-tool/add-workflows/:id
   */
  public async addWorkflows(id: string, workflowIds: string[]): Promise<boolean> {
    const body: WorkflowIdsDto = { workflowIds };
    const result = await this.apiRequestManager.post<ApiResponse<void>>(
      `${TenantToolsApi.BASE_URL}/add-workflows/${id}`,
      body,
    );
    return result.data.success;
  }

  /**
   * Desasocia workflows de un tenant tool.
   * Endpoint: POST /tenant-tool/remove-workflows/:id
   */
  public async removeWorkflows(id: string, workflowIds: string[]): Promise<boolean> {
    const body: WorkflowIdsDto = { workflowIds };
    const result = await this.apiRequestManager.post<ApiResponse<void>>(
      `${TenantToolsApi.BASE_URL}/remove-workflows/${id}`,
      body,
    );
    return result.data.success;
  }

  /**
   * Desconecta y limpia los secretos de un tenant tool.
   * Endpoint: DELETE /tenant-tool/disconnect/:toolId
   */
  public async disconnect(toolId: string): Promise<boolean> {
    const result = await this.apiRequestManager.delete<ApiResponse<boolean>>(
      `${TenantToolsApi.BASE_URL}/disconnect/${toolId}`,
    );
    return result.data.success;
  }

  /**
   * Elimina (soft-delete) un tenant tool.
   * Endpoint: DELETE /tenant-tool/:toolId
   */
  public async deleteTool(toolId: string): Promise<boolean> {
    const result = await this.apiRequestManager.delete<ApiResponse<boolean>>(
      `${TenantToolsApi.BASE_URL}/${toolId}`,
    );
    return result.data.success;
  }
}

export default TenantToolsApi;
