import { ApiResponse, CreateConfigDto, WhatsAppConfig, WhatsAppTemplate } from '@tesseract/types';
import ApiRequestManager from '../../../api-request-manager';

/**
 * Datos de presentación del número. El teléfono no se edita desde aquí.
 *
 * `workflowId` es tri-estado: ausente no lo toca, `null` desasigna el workflow por
 * defecto, string lo reasigna.
 */
export interface UpdateWhatsappConfigDto {
  displayName?: string;
  description?: string;
  workflowId?: string | null;
}

export interface CreateTemplateInput {
  name: string;
  displayName?: string;
  language?: string;
  variables?: { body?: string[]; header?: string[]; buttons?: string[] };
}

export interface UpdateTemplateInput {
  name?: string;
  displayName?: string;
  language?: string;
  variables?: { body?: string[]; header?: string[]; buttons?: string[] };
  isActive?: boolean;
}

class WhatsappConfigApi {
  public apiRequestManager: ApiRequestManager;
  private static BASE_URL = '/whatsapp-config';

  constructor() {
    this.apiRequestManager = ApiRequestManager.getInstance();
  }

  async addWhatsappConfiguration(whatsappConfig: CreateConfigDto): Promise<boolean> {
    const result = await this.apiRequestManager.post<ApiResponse<boolean>>(
      `${WhatsappConfigApi.BASE_URL}/create-config`,
      {
        workflowId: whatsappConfig.workflowId,
        phoneNumber: whatsappConfig.phoneNumber,
      },
    );
    return result.data.data || false;
  }

  async updateWhatsappConfiguration(
    id: string,
    whatsappConfig: UpdateWhatsappConfigDto,
  ): Promise<boolean> {
    const result = await this.apiRequestManager.patch<ApiResponse<boolean>>(
      `${WhatsappConfigApi.BASE_URL}/${id}`,
      whatsappConfig,
    );
    return result.data.data || false;
  }

  async getWhatsappConfigurationsByWorkflowId(
    workflowId: string,
  ): Promise<WhatsAppConfig[] | null> {
    const result = await this.apiRequestManager.get<ApiResponse<WhatsAppConfig[]>>(
      `${WhatsappConfigApi.BASE_URL}/list/${workflowId}`,
    );
    return result.data.data || null;
  }

  async deleteWhatsappConfiguration(id: string): Promise<boolean> {
    const result = await this.apiRequestManager.delete<ApiResponse<boolean>>(
      `${WhatsappConfigApi.BASE_URL}/${id}`,
    );
    return result.data.data || false;
  }

  async updateIsActiveStatus(id: string, isActive: boolean): Promise<boolean> {
    const result = await this.apiRequestManager.patch<ApiResponse<boolean>>(
      `${WhatsappConfigApi.BASE_URL}/${id}/isActive`,
      { isActive },
    );
    return result.data.data || false;
  }

  // ─── Templates ────────────────────────────────────────────────────────

  async createTemplate(configId: string, data: CreateTemplateInput): Promise<WhatsAppTemplate> {
    const result = await this.apiRequestManager.post<ApiResponse<WhatsAppTemplate>>(
      `${WhatsappConfigApi.BASE_URL}/${configId}/templates`,
      data,
    );
    return result.data.data!;
  }

  async listTemplates(configId: string): Promise<WhatsAppTemplate[]> {
    const result = await this.apiRequestManager.get<ApiResponse<WhatsAppTemplate[]>>(
      `${WhatsappConfigApi.BASE_URL}/${configId}/templates`,
    );
    return result.data.data ?? [];
  }

  async updateTemplate(
    templateId: string,
    data: UpdateTemplateInput,
  ): Promise<WhatsAppTemplate> {
    const result = await this.apiRequestManager.patch<ApiResponse<WhatsAppTemplate>>(
      `${WhatsappConfigApi.BASE_URL}/templates/${templateId}`,
      data,
    );
    return result.data.data!;
  }

  async deleteTemplate(templateId: string): Promise<boolean> {
    const result = await this.apiRequestManager.delete<ApiResponse<boolean>>(
      `${WhatsappConfigApi.BASE_URL}/templates/${templateId}`,
    );
    return result.data.data || false;
  }
}

export default WhatsappConfigApi;
