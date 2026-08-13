import { ApiResponse } from '@tesseract/types';
import ApiRequestManager from '../../../api-request-manager';

export interface CreateMessengerConfigDto {
  workflowId: string;
  pageId: string;
  pageName?: string;
  description?: string;
  pageAccessToken?: string;
  appSecret?: string;
}

/**
 * Edición de una página ya dada de alta. Todo es opcional: se manda lo que el
 * formulario tenga. Las credenciales vacías significan "conserva la actual" —el
 * backend nunca las devuelve, así que el formulario no puede mostrarlas.
 */
export interface UpdateMessengerConfigDto {
  pageId?: string;
  pageName?: string;
  description?: string;
  pageAccessToken?: string;
  appSecret?: string;
}

export interface MessengerConfigDto {
  id: string;
  pageId: string;
  pageName: string | null;
  description: string | null;
  provider: string;
  connectionStatus: 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
  lastConnectedAt: string | null;
  connectionError: string | null;
  isActive: boolean;
  defaultWorkflowId: string | null;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

class MessengerConfigApi {
  public apiRequestManager: ApiRequestManager;
  private static BASE_URL = '/messenger';

  constructor() {
    this.apiRequestManager = ApiRequestManager.getInstance();
  }

  async addMessengerConfiguration(messengerConfig: CreateMessengerConfigDto): Promise<boolean> {
    const result = await this.apiRequestManager.post<ApiResponse<boolean>>(
      `${MessengerConfigApi.BASE_URL}/create-config`,
      {
        workflowId: messengerConfig.workflowId,
        pageId: messengerConfig.pageId,
        pageName: messengerConfig.pageName,
        description: messengerConfig.description,
        pageAccessToken: messengerConfig.pageAccessToken,
        appSecret: messengerConfig.appSecret,
      },
    );

    return result.data.data || false;
  }

  async updateMessengerConfiguration(
    id: string,
    messengerConfig: UpdateMessengerConfigDto,
  ): Promise<boolean> {
    const result = await this.apiRequestManager.patch<ApiResponse<boolean>>(
      `${MessengerConfigApi.BASE_URL}/${id}`,
      messengerConfig,
    );

    return result.data.data || false;
  }

  async getMessengerConfigurationsByWorkflowId(
    workflowId: string,
  ): Promise<MessengerConfigDto[] | null> {
    const result = await this.apiRequestManager.get<ApiResponse<MessengerConfigDto[]>>(
      `${MessengerConfigApi.BASE_URL}/list/${workflowId}`,
    );

    return result.data.data || null;
  }

  async deleteMessengerConfiguration(id: string): Promise<boolean> {
    const result = await this.apiRequestManager.delete<ApiResponse<boolean>>(
      `${MessengerConfigApi.BASE_URL}/${id}`,
    );

    return result.data.data || false;
  }

  async updateIsActiveStatus(id: string, isActive: boolean): Promise<boolean> {
    const result = await this.apiRequestManager.patch<ApiResponse<boolean>>(
      `${MessengerConfigApi.BASE_URL}/${id}/isActive`,
      { isActive },
    );

    return result.data.data || false;
  }
}

export default MessengerConfigApi;
