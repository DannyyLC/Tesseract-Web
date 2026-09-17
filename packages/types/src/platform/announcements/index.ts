import { UserRole } from '../../identity/users';

/**
 * Duplicado a mano del enum `AnnouncementTemplate` de Prisma (packages/database), igual que
 * `WorkflowCategory` o `UserRole`: el web-client no importa `@tesseract/database`, así que los
 * enums de Prisma no cruzan al front y este paquete es el punto de sincronización manual.
 */
export enum AnnouncementTemplateKind {
  NEWS = 'NEWS',
  CELEBRATION = 'CELEBRATION',
}

/**
 * Estado visible en el panel de admin. Se DERIVA en el servicio a partir de
 * `isActive` / `fannedOutAt` / `expiresAt` — no existe como columna, para no crear una segunda
 * fuente de verdad que se desincronice contra la fecha de caducidad.
 */
export enum AnnouncementStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  EXPIRED = 'EXPIRED',
  UNPUBLISHED = 'UNPUBLISHED',
}

export interface CreateAnnouncementDto {
  title: string;
  message: string;
  titleEn?: string;
  messageEn?: string;
  template: AnnouncementTemplateKind;
  ctaLabel?: string;
  ctaLabelEn?: string;
  ctaUrl?: string;
  /** undefined/null = todas las organizaciones. */
  targetOrganizationId?: string | null;
  targetRoles: UserRole[];
  expiresAt?: string | null;
  publishNow: boolean;
}

export interface UpdateAnnouncementDto {
  ctaLabel?: string | null;
  ctaLabelEn?: string | null;
  ctaUrl?: string | null;
  expiresAt?: string | null;
  // Título/cuerpo solo aceptados por el backend mientras no se haya enviado (fannedOutAt null);
  // se listan igual aquí porque el mismo DTO cubre ambos casos y el 409 lo resuelve el backend.
  title?: string;
  message?: string;
  titleEn?: string;
  messageEn?: string;
}

export interface AnnouncementMetricsDto {
  delivered: number;
  dismissed: number;
  ctaClicked: number;
  read: number;
}

export interface AdminAnnouncementDto {
  id: string;
  title: string;
  message: string;
  titleEn: string | null;
  messageEn: string | null;
  template: AnnouncementTemplateKind;
  ctaLabel: string | null;
  ctaLabelEn: string | null;
  ctaUrl: string | null;
  targetOrganizationId: string | null;
  /** null cuando `targetOrganizationId` también es null (destino: todas). */
  targetOrganizationName: string | null;
  targetRoles: UserRole[];
  status: AnnouncementStatus;
  isActive: boolean;
  publishedAt: string | null;
  expiresAt: string | null;
  fannedOutAt: string | null;
  createdByEmail: string | null;
  createdAt: string;
  metrics: AnnouncementMetricsDto;
}

export interface AudiencePreviewDto {
  count: number;
}

/** Lo que recibe el modal bloqueante del lado del inquilino. */
export interface PendingAnnouncementDto {
  userNotificationId: string;
  template: AnnouncementTemplateKind;
  title: string;
  message: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  createdAt: string;
}
