import ApiRequestManager from '../../../api-request-manager';
import {
  ApiResponse,
  DatasetDto,
  DatasetField,
  DatasetImportResultDto,
  DatasetRecordDto,
  DatasetSummaryDto,
  DatasetUsageDto,
} from '@tesseract/types';

export interface AdminDatasetListResponse {
  datasets: DatasetSummaryDto[];
  usage: DatasetUsageDto;
}

/**
 * Espejo de `DatasetsApi`, pero con `organizationId` explícito en cada método en vez de tomarlo
 * del JWT: es lo que le permite al super admin operar el catálogo de cualquier organización,
 * igual que `WorkflowsAdminApi` frente a `WorkflowsApi`.
 */
class DatasetsAdminApi {
  public apiRequestManager: ApiRequestManager;
  private static BASE_URL = '/admin/organizations';

  constructor() {
    this.apiRequestManager = ApiRequestManager.getInstance();
  }

  private base(organizationId: string): string {
    return `${DatasetsAdminApi.BASE_URL}/${organizationId}/datasets`;
  }

  public async list(organizationId: string): Promise<AdminDatasetListResponse> {
    const result = await this.apiRequestManager.get<ApiResponse<AdminDatasetListResponse>>(
      this.base(organizationId),
    );
    if (!result.data.data) throw new Error('No data received from admin datasets endpoint');
    return result.data.data;
  }

  public async getById(organizationId: string, id: string): Promise<DatasetDto | null> {
    const result = await this.apiRequestManager.get<ApiResponse<DatasetDto>>(
      `${this.base(organizationId)}/${id}`,
    );
    return result.data.data ?? null;
  }

  public async create(
    organizationId: string,
    data: { name: string; description?: string; fields: DatasetField[] },
  ): Promise<DatasetDto | null> {
    const result = await this.apiRequestManager.post<ApiResponse<DatasetDto>>(
      this.base(organizationId),
      data,
    );
    return result.data.data ?? null;
  }

  public async update(
    organizationId: string,
    id: string,
    data: { name?: string; description?: string | null },
  ): Promise<DatasetDto | null> {
    const result = await this.apiRequestManager.put<ApiResponse<DatasetDto>>(
      `${this.base(organizationId)}/${id}`,
      data,
    );
    return result.data.data ?? null;
  }

  /** Mismo timeout largo que `DatasetsApi.updateFields`: el recálculo de fórmulas puede tardar. */
  public async updateFields(
    organizationId: string,
    id: string,
    fields: DatasetField[],
  ): Promise<DatasetDto | null> {
    const result = await this.apiRequestManager.put<ApiResponse<DatasetDto>>(
      `${this.base(organizationId)}/${id}/fields`,
      {
        fields: fields.map(({ key, label, type, options, formula, order }) => ({
          key,
          label,
          type,
          options,
          formula,
          order,
        })),
      },
      { timeout: 600_000 },
    );
    return result.data.data ?? null;
  }

  public async remove(organizationId: string, id: string): Promise<boolean> {
    const result = await this.apiRequestManager.delete<ApiResponse<null>>(
      `${this.base(organizationId)}/${id}`,
    );
    return result.data.success;
  }

  public async linkWorkflow(organizationId: string, id: string, workflowId: string): Promise<boolean> {
    const result = await this.apiRequestManager.post<ApiResponse<null>>(
      `${this.base(organizationId)}/${id}/workflows/${workflowId}`,
      {},
    );
    return result.data.success;
  }

  public async unlinkWorkflow(organizationId: string, id: string, workflowId: string): Promise<boolean> {
    const result = await this.apiRequestManager.delete<ApiResponse<null>>(
      `${this.base(organizationId)}/${id}/workflows/${workflowId}`,
    );
    return result.data.success;
  }

  public async listRecords(
    organizationId: string,
    id: string,
    params: { limit?: number; offset?: number } = {},
  ): Promise<{ total: number; items: DatasetRecordDto[] }> {
    const query = new URLSearchParams();
    if (params.limit !== undefined) query.append('limit', String(params.limit));
    if (params.offset !== undefined) query.append('offset', String(params.offset));
    const queryString = query.toString();

    const result = await this.apiRequestManager.get<
      ApiResponse<{ total: number; items: DatasetRecordDto[] }>
    >(`${this.base(organizationId)}/${id}/records${queryString ? `?${queryString}` : ''}`);
    return result.data.data ?? { total: 0, items: [] };
  }

  public async createRecord(
    organizationId: string,
    id: string,
    data: Record<string, unknown>,
  ): Promise<DatasetRecordDto | null> {
    const result = await this.apiRequestManager.post<ApiResponse<DatasetRecordDto>>(
      `${this.base(organizationId)}/${id}/records`,
      { data },
    );
    return result.data.data ?? null;
  }

  public async updateRecord(
    organizationId: string,
    id: string,
    recordId: string,
    data: Record<string, unknown>,
  ): Promise<DatasetRecordDto | null> {
    const result = await this.apiRequestManager.put<ApiResponse<DatasetRecordDto>>(
      `${this.base(organizationId)}/${id}/records/${recordId}`,
      { data },
    );
    return result.data.data ?? null;
  }

  public async deleteRecord(organizationId: string, id: string, recordId: string): Promise<boolean> {
    const result = await this.apiRequestManager.delete<ApiResponse<null>>(
      `${this.base(organizationId)}/${id}/records/${recordId}`,
    );
    return result.data.success;
  }

  public async importCsv(
    organizationId: string,
    id: string,
    csv: string,
  ): Promise<DatasetImportResultDto | null> {
    const result = await this.apiRequestManager.post<ApiResponse<DatasetImportResultDto>>(
      `${this.base(organizationId)}/${id}/import`,
      { csv },
    );
    return result.data.data ?? null;
  }
}

export default DatasetsAdminApi;
