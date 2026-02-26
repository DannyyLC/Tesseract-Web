import ApiRequestManager from '../../api_request_manager';
import { GetToolsDto, PaginatedResponse, ApiResponse } from '@tesseract/types';

class ToolCatalogApi {
  public apiRequestManager: ApiRequestManager;
  private static BASE_URL = '/tools-catalog';

  constructor() {
    this.apiRequestManager = ApiRequestManager.getInstance();
  }

  /**
   * Obtiene el catálogo de tools con sus funciones (cursor pagination)
   * Endpoint: GET /tools-catalog
   */
  public async getAllToolsWithFunctions(params: {
    cursor?: string | null;
    pageSize?: number;
    action?: 'next' | 'prev' | null;
    search?: string | null;
  } = {}): Promise<PaginatedResponse<GetToolsDto>> {
    const queryParams = new URLSearchParams();

    if (params.cursor) queryParams.append('cursor', params.cursor);
    if (params.pageSize) queryParams.append('pageSize', params.pageSize.toString());
    if (params.action) queryParams.append('action', params.action);
    if (params.search) queryParams.append('search', params.search);

    const queryString = queryParams.toString();
    const url = `${ToolCatalogApi.BASE_URL}${queryString ? `?${queryString}` : ''}`;

    const result = await this.apiRequestManager.get<ApiResponse<PaginatedResponse<GetToolsDto>>>(url);

    if (!result.data.data) {
      throw new Error('No data received from tools catalog endpoint');
    }

    return result.data.data;
  }
}

export default ToolCatalogApi;
