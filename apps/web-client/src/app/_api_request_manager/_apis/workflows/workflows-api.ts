import ApiRequestManager from '../../api_request_manager';
import {
  WorkflowStatsDto,
  WorkflowMetricsDto,
  WorkflowCategory,
  WorkflowsResponse,
  ApiResponse
} from '@tesseract/types';

class WorkflowsApi {
  public apiRequestManager: ApiRequestManager;
  private static BASE_URL = '/workflows';

  constructor() {
    this.apiRequestManager = ApiRequestManager.getInstance();
  }

  /**
   * Obtiene la foto inicial para el dashboard con filtros
   */
  public async getDashboardWorkflows(
    cursor?: string,
    pageSize: number = 10,
    action?: 'next' | 'prev',
    search?: string,
    isActive?: boolean,
    category?: WorkflowCategory
  ): Promise<WorkflowsResponse> {
    // Build query params
    const params = new URLSearchParams();
    if (cursor) params.append('cursor', cursor);
    if (pageSize) params.append('pageSize', pageSize.toString());
    if (action) params.append('action', action);
    if (search) params.append('search', search);
    if (isActive !== undefined) params.append('isActive', isActive.toString());
    if (category) params.append('category', category);

    const result = await this.apiRequestManager.get<ApiResponse<any>>(
      `${WorkflowsApi.BASE_URL}/dashboard?${params.toString()}`
    );
    return result.data.data;
  }

  /**
   * Obtiene estadísticas globales
   */
  public async getStats(): Promise<WorkflowStatsDto> {
    const result = await this.apiRequestManager.get<ApiResponse<WorkflowStatsDto>>(
      `${WorkflowsApi.BASE_URL}/stats`
    );
    return result.data.data!;
  }

  /**
   * Obtiene métricas detalladas de un workflow
   */
  public async getMetrics(workflowId: string, period: string = '30d'): Promise<WorkflowMetricsDto> {
    const result = await this.apiRequestManager.get<WorkflowMetricsDto>(
      `${WorkflowsApi.BASE_URL}/${workflowId}/metrics?period=${period}`
    );
    return result.data;
  }

  /**
   * Obtener un workflow por ID
   */
  public async findOne(id: string): Promise<any> {
    const result = await this.apiRequestManager.get<any>(`${WorkflowsApi.BASE_URL}/${id}`);
    return result.data;
  }

  /**
   * Actualizar un workflow
   */
  public async update(id: string, data: any): Promise<any> {
    const result = await this.apiRequestManager.put<any>(`${WorkflowsApi.BASE_URL}/${id}`, data);
    return result.data;
  }

  /**
   * Eliminar un workflow
   */
  public async remove(id: string): Promise<any> {
    const result = await this.apiRequestManager.delete<any>(`${WorkflowsApi.BASE_URL}/${id}`);
    return result.data;
  }

  /**
   * Ejecutar un workflow (REST/Síncrono)
   */
  public async execute(id: string, input: any, metadata?: any): Promise<any> {
    const result = await this.apiRequestManager.post<any>(
      `${WorkflowsApi.BASE_URL}/${id}/execute`,
      { input, metadata }
    );
    return result.data;
  }
}

export default WorkflowsApi;
