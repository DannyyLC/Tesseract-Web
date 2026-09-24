import { Injectable } from '@nestjs/common';
import { NotificationKind } from '@tesseract/database';
import { AnnouncementTemplateKind, PendingAnnouncementDto } from '@tesseract/types';
import { PrismaService } from '@/platform/database/prisma.service';

const MAX_PENDING = 3;

/**
 * Lado de lectura del inquilino: qué anuncios bloqueantes le tocan a este usuario ahora mismo,
 * y las dos acciones que puede tomar sobre ellos. Vive separado de `AnnouncementsService`
 * porque está en el camino caliente de cada entrada a la app y no comparte nada con el panel
 * de admin.
 */
@Injectable()
export class AnnouncementsReadService {
  constructor(private readonly prisma: PrismaService) {}

  async getPending(
    userId: string,
    organizationId: string,
    locale: string,
  ): Promise<PendingAnnouncementDto[]> {
    const now = new Date();
    const rows = await this.prisma.userNotification.findMany({
      where: {
        userId,
        organizationId,
        deletedAt: null,
        dismissedAt: null,
        notification: {
          kind: NotificationKind.ANNOUNCEMENT,
          isActive: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_PENDING,
      include: {
        notification: {
          select: { announcementTemplate: true, ctaLabel: true, ctaLabelEn: true, ctaUrl: true },
        },
      },
    });

    const wantsEnglish = locale === 'en';
    const pick = (en: string | null | undefined, es: string): string =>
      wantsEnglish && en ? en : es;
    const pickNullable = (en: string | null | undefined, es: string | null): string | null =>
      wantsEnglish && en ? en : es;

    return rows.map((row) => ({
      userNotificationId: row.id,
      template: row.notification.announcementTemplate as unknown as AnnouncementTemplateKind,
      title: pick(row.titleSnapshotEn, row.titleSnapshot),
      message: pick(row.messageSnapshotEn, row.messageSnapshot),
      ctaLabel: pickNullable(row.notification.ctaLabelEn, row.notification.ctaLabel),
      ctaUrl: row.notification.ctaUrl,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /**
   * Cerrar el modal también marca `isRead`: sin eso queda un badge sin leer para siempre y el
   * cron de limpieza (que exige `isRead`) nunca archiva la fila. Cerrar un modal bloqueante
   * es, a efectos prácticos, leerlo.
   */
  async dismiss(userNotificationId: string, userId: string, organizationId: string): Promise<void> {
    await this.prisma.userNotification.updateMany({
      where: { id: userNotificationId, userId, organizationId },
      data: { dismissedAt: new Date(), isRead: true },
    });
  }

  async registerCtaClick(
    userNotificationId: string,
    userId: string,
    organizationId: string,
  ): Promise<void> {
    await this.prisma.userNotification.updateMany({
      where: { id: userNotificationId, userId, organizationId, ctaClickedAt: null },
      data: { ctaClickedAt: new Date() },
    });
  }
}
