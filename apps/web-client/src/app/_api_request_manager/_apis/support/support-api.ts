import ApiRequestManager from '../../api_request_manager';
import { ServiceInfoRequestDto, ApiResponse } from '@tesseract/types';

class SupportApi {
  public apiRequestManager: ApiRequestManager;

  constructor() {
    this.apiRequestManager = ApiRequestManager.getInstance();
  }

  /**
   * Request information and comunicate with the support team
   */
  public async requestServiceInfoByEmail(dto: ServiceInfoRequestDto): Promise<boolean> {
    const result = await this.apiRequestManager.post<ApiResponse<boolean>>(
      `/users/request-service-info-by-email`,
      dto
    );
    return result.data.success;
  }

}

export default SupportApi;
