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
   * `fields` viene tal cual lo devolvió el GET, que trae `deletedAt` explícito en cada columna viva
   * (así se guarda el schema). El DTO de esta ruta no declara esa propiedad —el borrado lógico lo
   * calcula el servidor comparando qué `key` faltan, no algo que el cliente deba mandar— y el
   * ValidationPipe global rechaza cualquier propiedad extra, así que hay que descartarla aquí antes
   * de reenviarla.
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

  /**
   * POST /datasets/:id/workflows/request-connection — no enlaza nada, solo avisa a soporte. Acepta
   * varios workflows para que pedir todos a la vez sea un correo, no uno por workflow.
   */
  public async requestWorkflowConnection(id: string, workflowIds: string[]): Promise<boolean> {
    const result = await this.apiRequestManager.post<ApiResponse<boolean>>(
      `${DatasetsApi.BASE_URL}/${id}/workflows/request-connection`,
      { workflowIds },
    );
    return result.data.success;
  }

  // ─── Filas ─────────────────────────────────────────────────────────────────

  public async listRecords(
    id: string,
    params: { limit?: number; offset?: number; query?: string } = {},
  ): Promise<{ total: number; items: DatasetRecordDto[] }> {
    const query = new URLSearchParams();

    if (params.limit !== undefined) query.append('limit', String(params.limit));
    if (params.offset !== undefined) query.append('offset', String(params.offset));
    if (params.query) query.append('query', params.query);

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
   * POST /datasets/:id/records/bulk-delete — borra las filas seleccionadas en la rejilla.
   *
   * POST y no DELETE: los ids viajan en el body, y `DELETE /records/:recordId` ya ocupa esa forma
   * de URL.
   */
  public async deleteRecords(id: string, recordIds: string[]): Promise<{ deleted: number }> {
    const result = await this.apiRequestManager.post<ApiResponse<{ deleted: number }>>(
      `${DatasetsApi.BASE_URL}/${id}/records/bulk-delete`,
      { recordIds },
    );
    return result.data.data ?? { deleted: 0 };
  }

  /** DELETE /datasets/:id/records — borra todas las filas, el catálogo y sus columnas quedan igual. */
  public async clearRecords(id: string): Promise<{ deleted: number }> {
    const result = await this.apiRequestManager.delete<ApiResponse<{ deleted: number }>>(
      `${DatasetsApi.BASE_URL}/${id}/records`,
    );
    return result.data.data ?? { deleted: 0 };
  }

  /**
   * POST /datasets/:id/import
   *
   * El archivo viaja como texto: el navegador lo lee con `FileReader`, así que no hace falta
   * multipart ni infraestructura de subida en el Gateway. El nombre va aparte solo para que el
   * Gateway pueda rechazar la extensión equivocada.
   *
   * Timeout propio, como `updateFields`: importar el máximo de filas valida una por una, evalúa las
   * fórmulas y hace un `createMany`, y puede pasarse de los 30s por defecto. Cortar aquí no cancela
   * la transacción del servidor, así que el usuario vería un error sobre filas que **sí** se
   * guardaron y al reintentar las duplicaría.
   */
  public async importCsv(
    id: string,
    csv: string,
    fileName?: string,
  ): Promise<DatasetImportResultDto | null> {
    const result = await this.apiRequestManager.post<ApiResponse<DatasetImportResultDto>>(
      `${DatasetsApi.BASE_URL}/${id}/import`,
      { csv, ...(fileName ? { fileName } : {}) },
      { timeout: 300_000 },
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
