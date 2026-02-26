import ApiRequestManager from '../../api_request_manager';
import {
  CreateApiKeyDto,
  UpdateApiKeyDto,
  ApiKeyList,
  ApiKeyResponse,
} from '../../../_model/api-keys.dto';

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
  public async create(data: CreateApiKeyDto): Promise<ApiKeyResponse> {
    const response = await this.apiRequestManager.post<ApiKeyResponse>(
      `${ApiKeysApi.BASE_URL}`,
      data
    );
    return response.data;
  }

  /**
   * Obtiene todas las API Keys de una organización.
   * Endpoint: GET /api-keys
   */
  public async findAll(): Promise<ApiKeyList[]> {
    const response = await this.apiRequestManager.get<ApiKeyList[]>(`${ApiKeysApi.BASE_URL}`);
    return response.data;
  }

  /**
   * Obtiene una API Key específica por su ID.
   * Endpoint: GET /api-keys/{apiKeyId}
   */
  public async findOne(apiKeyId: string): Promise<ApiKeyList> {
    const response = await this.apiRequestManager.get<ApiKeyList>(
      `${ApiKeysApi.BASE_URL}/${apiKeyId}`
    );
    return response.data;
  }

  /**
   * Actualiza una API Key existente.
   * Endpoint: PATCH /api-keys/{apiKeyId}
   */
  public async update(apiKeyId: string, data: UpdateApiKeyDto): Promise<ApiKeyList> {
    const response = await this.apiRequestManager.patch<ApiKeyList>(
      `${ApiKeysApi.BASE_URL}/${apiKeyId}`,
      data
    );
    return response.data;
  }

  /**
   * Elimina (soft delete) una API Key.
   * Endpoint: DELETE /api-keys/{apiKeyId}
   */
  public async delete(apiKeyId: string): Promise<{ success: boolean; message: string }> {
    const response = await this.apiRequestManager.delete<{ success: boolean; message: string }>(
      `${ApiKeysApi.BASE_URL}/${apiKeyId}`
    );
    return response.data;
  }
}

export default ApiKeysApi;
