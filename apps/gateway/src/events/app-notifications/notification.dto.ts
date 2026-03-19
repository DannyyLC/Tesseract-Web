export interface AppNotificationDto {
  organizationId: string;
  roles: string[];
  notification: NotificationEventDto;
}

export interface NotificationEventDto {
  id: string;
  notificationCode: string;
  isRead?: boolean;
  title: string;
  desc: string;
  createdAt?: Date;
}
