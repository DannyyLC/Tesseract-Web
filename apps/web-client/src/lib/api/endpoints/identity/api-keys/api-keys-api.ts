import ApiRequestManager from '../../../api-request-manager';
import {
  CreateApiKeyDto,
  UpdateApiKeyDto,
  ApiKeyListDto,
  ApiKeyResponseDto,
  ApiKeysQuery,
  ApiKeysResponse,
} from '@tesseract/types';

class ApiKeysApi {
  public apiRequestManager: ApiRequestManager;
  private static BASE_URL = '/api-keys';

  constructor() {
    this.apiRequestManager = ApiRequestManager.getInstance();
  }

  /**
   * Crea una nueva API Key para la organización especificada.
   * Endpoint: POST /api-keys
   */
  public async create(data: CreateApiKeyDto): Promise<ApiKeyResponseDto> {
    const response = await this.apiRequestManager.post<ApiKeyResponseDto>(
      `${ApiKeysApi.BASE_URL}`,
      data,
    );
    return response.data;
  }

  /**
   * Obtiene las API Keys de la organización, paginadas por cursor.
   * Con `workflowId` se acotan a las de un workflow.
   * Endpoint: GET /api-keys
   */
  public async findAll(query: ApiKeysQuery = {}): Promise<ApiKeysResponse> {
    const params = new URLSearchParams();
    if (query.cursor) params.append('cursor', query.cursor);
    if (query.pageSize) params.append('pageSize', query.pageSize.toString());
    if (query.action) params.append('action', query.action);
    if (query.workflowId) params.append('workflowId', query.workflowId);
    if (query.search) params.append('search', query.search);

    const response = await this.apiRequestManager.get<ApiKeysResponse>(
      `${ApiKeysApi.BASE_URL}?${params.toString()}`,
    );
    return response.data;
  }

  /**
   * Obtiene una API Key específica por su ID.
   * Endpoint: GET /api-keys/{apiKeyId}
   */
  public async findOne(apiKeyId: string): Promise<ApiKeyListDto> {
    const response = await this.apiRequestManager.get<ApiKeyListDto>(
      `${ApiKeysApi.BASE_URL}/${apiKeyId}`,
    );
    return response.data;
  }

  /**
   * Actualiza una API Key existente.
   * Endpoint: PATCH /api-keys/{apiKeyId}
   */
  public async update(apiKeyId: string, data: UpdateApiKeyDto): Promise<ApiKeyListDto> {
    const response = await this.apiRequestManager.patch<ApiKeyListDto>(
      `${ApiKeysApi.BASE_URL}/${apiKeyId}`,
      data,
    );
    return response.data;
  }

  /**
   * Elimina (soft delete) una API Key.
   * Endpoint: DELETE /api-keys/{apiKeyId}
   */
  public async delete(apiKeyId: string): Promise<{ success: boolean; message: string }> {
    const response = await this.apiRequestManager.delete<{ success: boolean; message: string }>(
      `${ApiKeysApi.BASE_URL}/${apiKeyId}`,
    );
    return response.data;
  }
}

export default ApiKeysApi;
