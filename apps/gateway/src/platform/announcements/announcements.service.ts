import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationKind, Notification, Organization, Prisma } from '@tesseract/database';
import {
  ADMIN_PAGE_SIZE,
  AdminAnnouncementDto,
  AnnouncementMetricsDto,
  AnnouncementStatus,
  AnnouncementTemplateKind,
  AudiencePreviewDto,
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
  UserRole,
} from '@tesseract/types';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { PrismaService } from '@/platform/database/prisma.service';
import { UserPayload } from '@/platform/common/types/jwt-payload.type';
import { PLATFORM_ORG_SLUG } from '@/platform/common/constants/platform-org.constant';
import { ListAnnouncementsQueryDto } from './dto';

type NotificationWithTarget = Notification & { targetOrganization: Pick<Organization, 'id' | 'name'> | null };

interface MetricsRow {
  notificationId: string;
  delivered: number;
  dismissed: number;
  ctaClicked: number;
  read: number;
}

/**
 * Lado de escritura del super admin: crear, publicar (fan-out), despublicar, editar y medir
 * anuncios. El fan-out es propio (no extiende `UtilityService.sendNotificationToAppClients`):
 * ese método se traga los errores, es de una sola organización, hace templating `%s` sobre
 * texto libre del operador, y no filtra usuarios inactivos/borrados — cuatro motivos
 * independientes para no compartirlo. Ver comentario en `fanOut()`.
 */
@Injectable()
export class AnnouncementsService {
  private static readonly FANOUT_BATCH_SIZE = 1000;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  async create(dto: CreateAnnouncementDto, actor: UserPayload): Promise<AdminAnnouncementDto> {
    if (dto.targetOrganizationId) {
      const org = await this.prisma.organization.findUnique({
        where: { id: dto.targetOrganizationId },
        select: { id: true },
      });
      if (!org) throw new NotFoundException('La organización destino no existe');
    }
    this.assertFutureOrNull(dto.expiresAt);

    const notification = await this.prisma.notification.create({
      data: {
        code: `ANN-${randomUUID()}`,
        version: 1,
        kind: NotificationKind.ANNOUNCEMENT,
        titleTemplate: dto.title,
        messageTemplate: dto.message,
        titleTemplateEn: dto.titleEn ?? null,
        messageTemplateEn: dto.messageEn ?? null,
        announcementTemplate: dto.template as any,
        ctaLabel: dto.ctaLabel ?? null,
        ctaLabelEn: dto.ctaLabelEn ?? null,
        ctaUrl: dto.ctaUrl ?? null,
        targetOrganizationId: dto.targetOrganizationId ?? null,
        targetRoles: dto.targetRoles,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        isActive: true,
        createdById: actor.sub,
        createdByEmail: actor.email,
      },
    });

    if (dto.publishNow) {
      await this.publish(notification.id);
    }

    return this.getById(notification.id);
  }

  async update(id: string, dto: UpdateAnnouncementDto): Promise<AdminAnnouncementDto> {
    const row = await this.getAnnouncementOrThrow(id);

    const touchesContent =
      dto.title !== undefined ||
      dto.message !== undefined ||
      dto.titleEn !== undefined ||
      dto.messageEn !== undefined;
    if (touchesContent && row.fannedOutAt) {
      throw new ConflictException(
        'El anuncio ya fue enviado: el modal y la campana muestran una copia congelada al ' +
          'momento del envío, así que editar el título o el cuerpo ahora no cambiaría nada ' +
          'para quien ya lo recibió. Solo el CTA y la caducidad siguen editables.',
      );
    }
    if (dto.expiresAt !== undefined) this.assertFutureOrNull(dto.expiresAt);

    await this.prisma.notification.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { titleTemplate: dto.title }),
        ...(dto.message !== undefined && { messageTemplate: dto.message }),
        ...(dto.titleEn !== undefined && { titleTemplateEn: dto.titleEn }),
        ...(dto.messageEn !== undefined && { messageTemplateEn: dto.messageEn }),
        ...(dto.ctaLabel !== undefined && { ctaLabel: dto.ctaLabel }),
        ...(dto.ctaLabelEn !== undefined && { ctaLabelEn: dto.ctaLabelEn }),
        ...(dto.ctaUrl !== undefined && { ctaUrl: dto.ctaUrl }),
        ...(dto.expiresAt !== undefined && {
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        }),
      },
    });

    return this.getById(id);
  }

  async publish(id: string): Promise<{ delivered: number }> {
    const row = await this.getAnnouncementOrThrow(id);
    if (!row.isActive) {
      throw new ConflictException('El anuncio está despublicado; no se puede volver a enviar.');
    }
    if (!row.publishedAt) {
      await this.prisma.notification.update({ where: { id }, data: { publishedAt: new Date() } });
    }
    return this.fanOut(id);
  }

  async unpublish(id: string): Promise<void> {
    await this.getAnnouncementOrThrow(id);
    await this.prisma.$transaction([
      this.prisma.notification.update({ where: { id }, data: { isActive: false } }),
      this.prisma.userNotification.updateMany({
        where: { notificationId: id, deletedAt: null },
        data: { deletedAt: new Date() },
      }),
    ]);
  }

  /**
   * Reparte el anuncio a su audiencia. Reclama primero (`fannedOutAt` condicional) para que
   * dos instancias de Cloud Run, o un doble clic en "publicar", no lo entreguen dos veces; un
   * crash a media entrega sub-entrega en vez de duplicar, que es la dirección correcta para un
   * modal que se muestra una sola vez. No se envuelve en `$transaction`: miles de inserts
   * agotarían el timeout de una transacción interactiva.
   */
  async fanOut(id: string): Promise<{ delivered: number }> {
    const claimed = await this.prisma.notification.updateMany({
      where: { id, kind: NotificationKind.ANNOUNCEMENT, fannedOutAt: null },
      data: { fannedOutAt: new Date() },
    });
    if (claimed.count !== 1) {
      throw new ConflictException('El anuncio ya fue entregado.');
    }

    const notification = await this.prisma.notification.findUniqueOrThrow({ where: { id } });
    const roles = (notification.targetRoles as string[]) ?? [];

    const where: Prisma.UserWhereInput = {
      isActive: true,
      deletedAt: null,
      role: { in: roles as any },
      organization: {
        isActive: true,
        deletedAt: null,
        // Si el operador apunta explícitamente a la org de plataforma se respeta (útil para
        // probar una plantilla); solo se excluye en el envío global.
        ...(notification.targetOrganizationId
          ? { id: notification.targetOrganizationId }
          : { slug: { not: PLATFORM_ORG_SLUG } }),
      },
    };

    let cursor: string | undefined;
    let delivered = 0;

    for (;;) {
      const users = await this.prisma.user.findMany({
        where,
        select: { id: true, organizationId: true },
        orderBy: { id: 'asc' },
        take: AnnouncementsService.FANOUT_BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (users.length === 0) break;

      await this.prisma.userNotification.createMany({
        data: users.map((u) => ({
          userId: u.id,
          organizationId: u.organizationId,
          notificationId: id,
          isRead: false,
          titleSnapshot: notification.titleTemplate,
          messageSnapshot: notification.messageTemplate,
          titleSnapshotEn: notification.titleTemplateEn,
          messageSnapshotEn: notification.messageTemplateEn,
        })),
      });

      delivered += users.length;
      cursor = users[users.length - 1].id;
      if (users.length < AnnouncementsService.FANOUT_BATCH_SIZE) break;
    }

    await this.prisma.notification.update({ where: { id }, data: { deliveredCount: delivered } });
    this.logger.info(`AnnouncementsService - fanOut >> anuncio ${id} entregado a ${delivered} usuarios`);
    return { delivered };
  }

  async audiencePreview(organizationId: string | undefined, roles: UserRole[]): Promise<AudiencePreviewDto> {
    const count = await this.prisma.user.count({
      where: {
        isActive: true,
        deletedAt: null,
        role: { in: roles as any },
        organization: {
          isActive: true,
          deletedAt: null,
          ...(organizationId ? { id: organizationId } : { slug: { not: PLATFORM_ORG_SLUG } }),
        },
      },
    });
    return { count };
  }

  async getById(id: string): Promise<AdminAnnouncementDto> {
    const row = await this.prisma.notification.findFirst({
      where: { id, kind: NotificationKind.ANNOUNCEMENT },
      include: { targetOrganization: { select: { id: true, name: true } } },
    });
    if (!row) throw new NotFoundException('Anuncio no encontrado');
    const metrics = await this.getMetrics(id);
    return this.toAdminDto(row, metrics);
  }

  async list(query: ListAnnouncementsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? ADMIN_PAGE_SIZE;
    const skip = (page - 1) * limit;
    const now = new Date();

    const where: Prisma.NotificationWhereInput = {
      kind: NotificationKind.ANNOUNCEMENT,
      ...(query.organizationId && { targetOrganizationId: query.organizationId }),
      ...(query.status && this.statusWhere(query.status, now)),
    };

    const [rows, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { targetOrganization: { select: { id: true, name: true } } },
      }),
      this.prisma.notification.count({ where }),
    ]);

    const metrics = await this.getMetricsMap(rows.map((r) => r.id));
    const data = rows.map((row) => this.toAdminDto(row, metrics.get(row.id)));

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  private async getAnnouncementOrThrow(id: string): Promise<Notification> {
    const row = await this.prisma.notification.findFirst({
      where: { id, kind: NotificationKind.ANNOUNCEMENT },
    });
    if (!row) throw new NotFoundException('Anuncio no encontrado');
    return row;
  }

  private assertFutureOrNull(expiresAt: string | null | undefined): void {
    if (!expiresAt) return;
    if (new Date(expiresAt).getTime() <= Date.now()) {
      throw new BadRequestException('expiresAt debe ser una fecha futura');
    }
  }

  /**
   * Rama a rama con `deriveStatus`: cualquier cambio en cómo se deriva el estado tiene que
   * tocar las dos, o el filtro de la lista y el chip que se muestra dejan de coincidir.
   */
  private statusWhere(status: AnnouncementStatus, now: Date): Prisma.NotificationWhereInput {
    switch (status) {
      case AnnouncementStatus.DRAFT:
        return { fannedOutAt: null };
      case AnnouncementStatus.UNPUBLISHED:
        return { isActive: false, fannedOutAt: { not: null } };
      case AnnouncementStatus.EXPIRED:
        return { isActive: true, fannedOutAt: { not: null }, expiresAt: { lte: now } };
      case AnnouncementStatus.PUBLISHED:
        return {
          isActive: true,
          fannedOutAt: { not: null },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        };
    }
  }

  private deriveStatus(
    row: Pick<Notification, 'isActive' | 'fannedOutAt' | 'expiresAt'>,
    now = new Date(),
  ): AnnouncementStatus {
    if (!row.fannedOutAt) return AnnouncementStatus.DRAFT;
    if (!row.isActive) return AnnouncementStatus.UNPUBLISHED;
    if (row.expiresAt && row.expiresAt <= now) return AnnouncementStatus.EXPIRED;
    return AnnouncementStatus.PUBLISHED;
  }

  private async getMetrics(id: string): Promise<AnnouncementMetricsDto> {
    const map = await this.getMetricsMap([id]);
    return map.get(id) ?? { delivered: 0, dismissed: 0, ctaClicked: 0, read: 0 };
  }

  /**
   * Un solo raw query para lista + detalle. El `::int` no es opcional: `count(*)` llega como
   * BigInt y `JSON.stringify` truena al serializar la respuesta si no se castea en SQL.
   */
  private async getMetricsMap(ids: string[]): Promise<Map<string, AnnouncementMetricsDto>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<MetricsRow[]>`
      SELECT "notificationId",
             count(*)::int                                           AS delivered,
             count(*) FILTER (WHERE "dismissedAt"  IS NOT NULL)::int AS dismissed,
             count(*) FILTER (WHERE "ctaClickedAt" IS NOT NULL)::int AS "ctaClicked",
             count(*) FILTER (WHERE "isRead")::int                   AS read
      FROM   "user_notifications"
      WHERE  "notificationId" = ANY(${ids}::text[])
      GROUP  BY "notificationId"
    `;
    return new Map(
      rows.map((r) => [
        r.notificationId,
        { delivered: r.delivered, dismissed: r.dismissed, ctaClicked: r.ctaClicked, read: r.read },
      ]),
    );
  }

  private toAdminDto(row: NotificationWithTarget, metrics?: AnnouncementMetricsDto): AdminAnnouncementDto {
    const m = metrics ?? { delivered: 0, dismissed: 0, ctaClicked: 0, read: 0 };
    return {
      id: row.id,
      title: row.titleTemplate,
      message: row.messageTemplate,
      titleEn: row.titleTemplateEn,
      messageEn: row.messageTemplateEn,
      template: row.announcementTemplate as unknown as AnnouncementTemplateKind,
      ctaLabel: row.ctaLabel,
      ctaLabelEn: row.ctaLabelEn,
      ctaUrl: row.ctaUrl,
      targetOrganizationId: row.targetOrganizationId,
      targetOrganizationName: row.targetOrganization?.name ?? null,
      targetRoles: (row.targetRoles as string[]) as UserRole[],
      status: this.deriveStatus(row),
      isActive: row.isActive,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      fannedOutAt: row.fannedOutAt?.toISOString() ?? null,
      createdByEmail: row.createdByEmail,
      createdAt: row.createdAt.toISOString(),
      // El denominador que se muestra es el conteo denormalizado al momento del envío, no el
      // count(*) vivo: ese baja si un usuario purgado cascadea y las métricas no deberían moverse
      // por eso.
      metrics: { ...m, delivered: row.deliveredCount },
    };
  }
}
