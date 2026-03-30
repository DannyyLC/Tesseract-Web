import ApiRequestManager from '../../api_request_manager';
import { NotificationEventDto, PaginatedResponse, ApiResponse } from '@tesseract/types';

class NotificationsApi {
  public apiRequestManager: ApiRequestManager;
  private static BASE_URL = '/users/notifications';

  constructor() {
    this.apiRequestManager = ApiRequestManager.getInstance();
  }

  /**
   * Get paginated notifications for the current user
   */
  public async getNotifications(
    cursor?: string | null,
    pageSize: number = 10,
  ): Promise<PaginatedResponse<NotificationEventDto>> {
    const params = new URLSearchParams();
    if (cursor) params.append('cursor', cursor);
    if (pageSize) params.append('pageSize', pageSize.toString());

    const result = await this.apiRequestManager.get<
      ApiResponse<PaginatedResponse<NotificationEventDto>>
    >(`${NotificationsApi.BASE_URL}?${params.toString()}`);
    return result.data.data!;
  }

  /**
   * Get the count of unread notifications
   */
  public async getUnreadCount(): Promise<number> {
    const result = await this.apiRequestManager.get<ApiResponse<number>>(
      `${NotificationsApi.BASE_URL}/unread-count`,
    );
    return result.data.data!;
  }

  /**
   * Mark a specific notification as read
   */
  public async markAsRead(notificationId: string): Promise<void> {
    await this.apiRequestManager.patch<void>(
      `${NotificationsApi.BASE_URL}/${notificationId}/read`,
      {},
    );
  }

  /**
   * Mark all notifications as read
   */
  public async markAllAsRead(): Promise<void> {
    await this.apiRequestManager.patch<void>(`${NotificationsApi.BASE_URL}/read-all`, {});
  }

  /**
   * Delete a notification
   */
  public async deleteNotification(notificationId: string): Promise<void> {
    await this.apiRequestManager.delete<void>(`${NotificationsApi.BASE_URL}/${notificationId}`);
  }
}

export default NotificationsApi;
