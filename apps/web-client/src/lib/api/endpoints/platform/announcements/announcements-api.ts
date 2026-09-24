import ApiRequestManager from '../../../api-request-manager';
import { ApiResponse, PendingAnnouncementDto } from '@tesseract/types';

class AnnouncementsApi {
  public apiRequestManager: ApiRequestManager;
  private static BASE_URL = '/announcements';

  constructor() {
    this.apiRequestManager = ApiRequestManager.getInstance();
  }

  public async getPending(locale: string): Promise<PendingAnnouncementDto[]> {
    const result = await this.apiRequestManager.get<ApiResponse<PendingAnnouncementDto[]>>(
      `${AnnouncementsApi.BASE_URL}/pending?locale=${locale}`,
    );
    return result.data.data!;
  }

  public async dismiss(userNotificationId: string): Promise<void> {
    await this.apiRequestManager.post<void>(
      `${AnnouncementsApi.BASE_URL}/${userNotificationId}/dismiss`,
      {},
    );
  }

  public async registerCtaClick(userNotificationId: string): Promise<void> {
    await this.apiRequestManager.post<void>(
      `${AnnouncementsApi.BASE_URL}/${userNotificationId}/cta-click`,
      {},
    );
  }
}

export default AnnouncementsApi;
