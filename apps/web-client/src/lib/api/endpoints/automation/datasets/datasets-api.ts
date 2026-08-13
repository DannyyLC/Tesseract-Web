import ApiRequestManager from '../../../api-request-manager';
import {
  ApiResponse,
  DatasetDto,
  DatasetField,
  DatasetFieldValuesResponse,
  DatasetImportResultDto,
  DatasetRecordDto,
  DatasetSearchRequest,
  DatasetSearchResponse,
  DatasetSummaryDto,
  DatasetUsageDto,
} from '@tesseract/types';

export interface DatasetListResponse {
  datasets: DatasetSummaryDto[];
  usage: DatasetUsageDto;
}

class DatasetsApi {
  public apiRequestManager: ApiRequestManager;
  private static BASE_URL = '/datasets';

  constructor() {
    this.apiRequestManager = ApiRequestManager.getInstance();
  }

  /** GET /datasets — listado con el uso contra los límites del plan. */
  public async list(): Promise<DatasetListResponse> {
    const result = await this.apiRequestManager.get<ApiResponse<DatasetListResponse>>(
      DatasetsApi.BASE_URL,
    );

    if (!result.data.data) {
      throw new Error('No data received from datasets endpoint');
    }

    return result.data.data;
  }

  /** GET /datasets/:id */
  public async getById(id: string): Promise<DatasetDto | null> {
    const result = await this.apiRequestManager.get<ApiResponse<DatasetDto>>(
      `${DatasetsApi.BASE_URL}/${id}`,
    );
    return result.data.data ?? null;
  }

  /** POST /datasets */
  public async create(data: {
    name: string;
    description?: string;
    fields: DatasetField[];
  }): Promise<DatasetDto | null> {
    const result = await this.apiRequestManager.post<ApiResponse<DatasetDto>>(
      DatasetsApi.BASE_URL,
      data,
    );
    return result.data.data ?? null;
  }

  /** PUT /datasets/:id */
  public async update(
    id: string,
    data: { name?: string; description?: string | null },
  ): Promise<DatasetDto | null> {
    const result = await this.apiRequestManager.put<ApiResponse<DatasetDto>>(
      `${DatasetsApi.BASE_URL}/${id}`,
      data,
    );
    return result.data.data ?? null;
  }

  /**
   * PUT /datasets/:id/fields
   *
   * Se manda la definición completa. Lo que se omita queda borrado lógicamente: sus valores siguen
   * guardados, así que volver a mandar la columna con la misma clave la restaura intacta.
   *
   * **Timeout propio, muy por encima del general.** Si el cambio toca una fórmula, el servidor
   * recalcula esa columna en todas las filas del catálogo dentro de la misma petición; con decenas
   * de miles de filas eso pasa de los 30 s que trae `ApiRequestManager` por defecto. Cortar aquí no
   * cancelaría nada —la transacción se commitea igual— y el cliente vería un error sobre algo que
   * sí se guardó, invitándolo a reintentar y a disparar un segundo recálculo.
   */
  public async updateFields(id: string, fields: DatasetField[]): Promise<DatasetDto | null> {
    const result = await this.apiRequestManager.put<ApiResponse<DatasetDto>>(
      `${DatasetsApi.BASE_URL}/${id}/fields`,
      { fields },
      { timeout: 600_000 },
    );
    return result.data.data ?? null;
  }

  /** DELETE /datasets/:id */
  public async remove(id: string): Promise<boolean> {
    const result = await this.apiRequestManager.delete<ApiResponse<null>>(
      `${DatasetsApi.BASE_URL}/${id}`,
    );
    return result.data.success;
  }

  // ─── Enlace con workflows ──────────────────────────────────────────────────

  public async linkWorkflow(id: string, workflowId: string): Promise<boolean> {
    const result = await this.apiRequestManager.post<ApiResponse<null>>(
      `${DatasetsApi.BASE_URL}/${id}/workflows/${workflowId}`,
      {},
    );
    return result.data.success;
  }

  public async unlinkWorkflow(id: string, workflowId: string): Promise<boolean> {
    const result = await this.apiRequestManager.delete<ApiResponse<null>>(
      `${DatasetsApi.BASE_URL}/${id}/workflows/${workflowId}`,
    );
    return result.data.success;
  }

  // ─── Filas ─────────────────────────────────────────────────────────────────

  public async listRecords(
    id: string,
    params: { limit?: number; offset?: number } = {},
  ): Promise<{ total: number; items: DatasetRecordDto[] }> {
    const query = new URLSearchParams();

    if (params.limit !== undefined) query.append('limit', String(params.limit));
    if (params.offset !== undefined) query.append('offset', String(params.offset));

    const queryString = query.toString();
    const result = await this.apiRequestManager.get<
      ApiResponse<{ total: number; items: DatasetRecordDto[] }>
    >(`${DatasetsApi.BASE_URL}/${id}/records${queryString ? `?${queryString}` : ''}`);

    return result.data.data ?? { total: 0, items: [] };
  }

  public async createRecord(
    id: string,
    data: Record<string, unknown>,
  ): Promise<DatasetRecordDto | null> {
    const result = await this.apiRequestManager.post<ApiResponse<DatasetRecordDto>>(
      `${DatasetsApi.BASE_URL}/${id}/records`,
      { data },
    );
    return result.data.data ?? null;
  }

  public async updateRecord(
    id: string,
    recordId: string,
    data: Record<string, unknown>,
  ): Promise<DatasetRecordDto | null> {
    const result = await this.apiRequestManager.put<ApiResponse<DatasetRecordDto>>(
      `${DatasetsApi.BASE_URL}/${id}/records/${recordId}`,
      { data },
    );
    return result.data.data ?? null;
  }

  public async deleteRecord(id: string, recordId: string): Promise<boolean> {
    const result = await this.apiRequestManager.delete<ApiResponse<null>>(
      `${DatasetsApi.BASE_URL}/${id}/records/${recordId}`,
    );
    return result.data.success;
  }

  /**
   * POST /datasets/:id/import
   *
   * El archivo viaja como texto: el navegador lo lee con `FileReader`, así que no hace falta
   * multipart ni infraestructura de subida en el Gateway.
   */
  public async importCsv(id: string, csv: string): Promise<DatasetImportResultDto | null> {
    const result = await this.apiRequestManager.post<ApiResponse<DatasetImportResultDto>>(
      `${DatasetsApi.BASE_URL}/${id}/import`,
      { csv },
    );
    return result.data.data ?? null;
  }

  // ─── Consulta (mismo motor que usa el agente) ──────────────────────────────

  public async search(
    id: string,
    request: DatasetSearchRequest,
  ): Promise<DatasetSearchResponse> {
    const result = await this.apiRequestManager.post<ApiResponse<DatasetSearchResponse>>(
      `${DatasetsApi.BASE_URL}/${id}/search`,
      request,
    );
    return result.data.data ?? { total: 0, items: [] };
  }

  public async fieldValues(id: string, field: string): Promise<DatasetFieldValuesResponse | null> {
    const result = await this.apiRequestManager.get<ApiResponse<DatasetFieldValuesResponse>>(
      `${DatasetsApi.BASE_URL}/${id}/values?field=${encodeURIComponent(field)}`,
    );
    return result.data.data ?? null;
  }
}

export default DatasetsApi;
