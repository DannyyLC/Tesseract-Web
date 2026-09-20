export interface NotificationEventDto {
  id: string;
  notificationCode: string;
  isRead: boolean;
  title: string;
  desc: string;
  createdAt: Date;
  /** Marca visual en la campana. Ausente en las notificaciones de plantilla. */
  isAnnouncement?: boolean;
  announcementTemplate?: 'NEWS' | 'CELEBRATION';
}
