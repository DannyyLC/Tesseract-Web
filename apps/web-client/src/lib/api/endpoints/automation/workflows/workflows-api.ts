import { unwrapData } from '@/lib/api/unwrap-data';
import ApiRequestManager from '../../../api-request-manager';
import {
  WorkflowStatsDto,
  WorkflowMetricsDto,
  WorkflowCategory,
  WorkflowsResponse,
  ApiResponse,
  HourlyDistributionDto,
} from '@tesseract/types';

/** Detalle de `GET /workflows/:id` (`WorkflowsService.findOne`). */
export interface WorkflowDetail {
  id: string;
  name: string;
  description: string | null;
  category: WorkflowCategory;
  isActive: boolean;
  isPaused: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  /** `null` = hereda la zona de la organización. */
  timezone: string | null;
  organization: { timezone: string };
  tenantTools: Array<{
    id: string;
    displayName: string;
    status: string;
    toolCatalog: { id: string; displayName: string; icon: string | null } | null;
  }>;
}

/** Campos editables desde el detalle (`UpdateWorkflowDto`). */
export interface UpdateWorkflowInput {
  name?: string;
  description?: string;
  isActive?: boolean;
  timezone?: string | null;
}

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
    category?: WorkflowCategory,
  ): Promise<WorkflowsResponse> {
    // Build query params
    const params = new URLSearchParams();
    if (cursor) params.append('cursor', cursor);
    if (pageSize) params.append('pageSize', pageSize.toString());
    if (action) params.append('action', action);
    if (search) params.append('search', search);
    if (isActive !== undefined) params.append('isActive', isActive.toString());
    if (category) params.append('category', category);

    const result = await this.apiRequestManager.get<ApiResponse<WorkflowsResponse>>(
      `${WorkflowsApi.BASE_URL}/dashboard?${params.toString()}`,
    );
    return unwrapData(result);
  }

  /**
   * Obtiene estadísticas globales
   */
  public async getStats(): Promise<WorkflowStatsDto> {
    const result = await this.apiRequestManager.get<ApiResponse<WorkflowStatsDto>>(
      `${WorkflowsApi.BASE_URL}/stats`,
    );
    return unwrapData(result);
  }

  /**
   * Obtiene métricas detalladas de un workflow
   *
   * `tzSource` elige la zona de las series. Por defecto la de la organización, que es
   * la que usan todas las gráficas; 'workflow' solo aplica si ese workflow define una
   * zona propia.
   */
  public async getMetrics(
    workflowId: string,
    period: string = '30d',
    tzSource: 'organization' | 'workflow' = 'organization',
  ): Promise<WorkflowMetricsDto> {
    const result = await this.apiRequestManager.get<WorkflowMetricsDto>(
      `${WorkflowsApi.BASE_URL}/${workflowId}/metrics?period=${period}&tz=${tzSource}`,
    );
    return result.data;
  }

  /**
   * Distribución de ejecuciones del workflow por hora del día (24 franjas)
   */
  public async getHourlyDistribution(
    workflowId: string,
    period: string = '30d',
    tzSource: 'organization' | 'workflow' = 'organization',
  ): Promise<HourlyDistributionDto> {
    const result = await this.apiRequestManager.get<HourlyDistributionDto>(
      `${WorkflowsApi.BASE_URL}/${workflowId}/hourly-distribution?period=${period}&tz=${tzSource}`,
    );
    return result.data;
  }

  /**
   * Obtener un workflow por ID
   */
  public async findOne(id: string): Promise<WorkflowDetail> {
    const result = await this.apiRequestManager.get<WorkflowDetail>(
      `${WorkflowsApi.BASE_URL}/${id}`,
    );
    return result.data;
  }

  /**
   * Actualizar un workflow
   */
  public async update(id: string, data: UpdateWorkflowInput): Promise<unknown> {
    const result = await this.apiRequestManager.put<unknown>(
      `${WorkflowsApi.BASE_URL}/${id}`,
      data,
    );
    return result.data;
  }

  /**
   * Eliminar un workflow
   */
  public async remove(id: string): Promise<unknown> {
    const result = await this.apiRequestManager.delete<unknown>(`${WorkflowsApi.BASE_URL}/${id}`);
    return result.data;
  }

  /**
   * Ejecutar un workflow (REST/Síncrono)
   */
  public async execute(
    id: string,
    input: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ): Promise<unknown> {
    const result = await this.apiRequestManager.post<unknown>(
      `${WorkflowsApi.BASE_URL}/${id}/execute`,
      { input, metadata },
    );
    return result.data;
  }
}

export default WorkflowsApi;
