import { ApiResponse, CreateConfigDto } from "@tesseract/types";
import ApiRequestManager from "../../api_request_manager";
import { WhatsAppConfig } from '@tesseract/database';

class WhatsappConfigApi {
  public apiRequestManager: ApiRequestManager;
  private static BASE_URL = '/whatsapp-config';

  constructor() {
    this.apiRequestManager = ApiRequestManager.getInstance();
  }

  async addWhatsappConfiguration(whatsappConfig: CreateConfigDto): Promise<boolean> {
    const result = await this.apiRequestManager.post< ApiResponse<boolean>>(
      `${WhatsappConfigApi.BASE_URL}/create-config`,
      {
        workflowId: whatsappConfig.workflowId,
        phoneNumber: whatsappConfig.phoneNumber,
      }
    );
    return result.data.data || false;
  }

  async getWhatsappConfigurationsByWorkflowId(workflowId: string): Promise<WhatsAppConfig[] | null> {
    const result = await this.apiRequestManager.get<ApiResponse<WhatsAppConfig[]>>(
      `${WhatsappConfigApi.BASE_URL}/list/${workflowId}`
    );
    return result.data.data || null;
  }

  async deleteWhatsappConfiguration(id: string): Promise<boolean> {
    const result = await this.apiRequestManager.delete<ApiResponse<boolean>>(
      `${WhatsappConfigApi.BASE_URL}/${id}`
    );
    return result.data.data || false;
  }

  async updateIsActiveStatus(id: string, isActive: boolean): Promise<boolean> {
    const result = await this.apiRequestManager.patch<ApiResponse<boolean>>(
      `${WhatsappConfigApi.BASE_URL}/${id}/isActive`,
      { isActive }
    );
    return result.data.data || false;
  }

}

export default WhatsappConfigApi;