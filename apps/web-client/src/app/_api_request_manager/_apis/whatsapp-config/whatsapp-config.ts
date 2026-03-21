import { CreateConfigDto } from "@tesseract/types";
import ApiRequestManager from "../../api_request_manager";
import { WhatsAppConfig } from '@tesseract/database';

class WhatsappConfigApi {
  public apiRequestManager: ApiRequestManager;
  private static BASE_URL = '/whatsapp-config';

  constructor() {
    this.apiRequestManager = ApiRequestManager.getInstance();
  }

  async addWhatsappConfiguration(whatsappConfig: CreateConfigDto): Promise<boolean> {
    console.log('Adding WhatsApp configuration with data:', JSON.stringify(whatsappConfig));
    const result = await this.apiRequestManager.post<boolean>(
      `${WhatsappConfigApi.BASE_URL}/create-config`,
      {
        workflowId: whatsappConfig.workflowId,
        phoneNumber: whatsappConfig.phoneNumber,
      }
    );
    return result.data;
  }

}

export default WhatsappConfigApi;