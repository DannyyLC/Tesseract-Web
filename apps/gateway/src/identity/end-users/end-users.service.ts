import { PrismaService } from '@/platform/database/prisma.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConversationStatus, Prisma } from '@tesseract/database';
import {
  DashboardEndUserDto,
  EndUserBlockedFilter,
  PaginatedResponse,
} from '@tesseract/types';
import { CursorPaginatedResponseUtils } from '@/platform/common/responses/cursor-paginated-response';

/** Nombre de quien bloqueó: viaja en el DTO para no obligar al cliente a cruzarlo por su cuenta. */
const BLOCKED_BY_INCLUDE = { blockedBy: { select: { name: true } } } as const;

/**
 * Cómo se identifica a un contacto en el canal por el que llega.
 *
 * Son las dos llaves únicas de `EndUser` y se corresponden con lo que entrega cada webhook:
 * el `from` crudo de WhatsApp y `messenger:<pageId>:<psid>` en Messenger. Se guardan tal cual
 * llegan, así que el match es exacto y por índice: no hay normalización que pueda fallar.
 */
export type EndUserIdentifier = { phoneNumber: string } | { externalId: string };

@Injectable()
export class EndUsersService {
  constructor(private readonly prismaService: PrismaService) {}

  async getDashboardData(
    idOrganization: string,
    cursor: string | null = null,
    pageSize = 10,
    paginationAction: 'next' | 'prev' | null = null,
    filters?: { search?: string; blocked?: EndUserBlockedFilter },
  ): Promise<PaginatedResponse<DashboardEndUserDto>> {
    const where: Prisma.EndUserWhereInput = {
      organizationId: idOrganization,
      ...this.buildBlockedFilter(filters?.blocked),
      ...this.buildSearchFilter(filters?.search),
    };

    const endUsers = await this.prismaService.endUser.findMany({
      where,
      skip: cursor ? 1 : 0,
      take:
        paginationAction === 'next' || paginationAction === null ? pageSize + 1 : -(pageSize + 1),
      cursor: cursor ? { id: cursor } : undefined,
      select: {
        id: true,
        phoneNumber: true,
        email: true,
        externalId: true,
        name: true,
        avatar: true,
        metadata: true,
        lastSeenAt: true,
        createdAt: true,
        blockedAt: true,
        blockedReason: true,
        ...BLOCKED_BY_INCLUDE,
      },
      // Quién escribió hace rato importa más que quién se dio de alta, así que manda
      // `lastSeenAt`; los contactos sin actividad registrada se van al final en vez de
      // encabezar la lista, que es lo que hace Postgres con los NULL en DESC.
      //
      // El desempate por `id` es lo que hace estable al cursor: sin él, dos filas con el
      // mismo `lastSeenAt` pueden repetirse o saltarse entre páginas.
      orderBy: [{ lastSeenAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
    });

    const paginatedData = await CursorPaginatedResponseUtils.getInstance().build(
      endUsers,
      pageSize,
      paginationAction,
    );

    return {
      ...paginatedData,
      items: paginatedData.items.map((endUser) => this.toDashboardDto(endUser)),
    };
  }

  /**
   * ¿Hay que descartar lo que mande este contacto?
   *
   * La consultan los webhooks de cada canal ANTES de bufferear el mensaje, agendar la tarea,
   * transcribir el audio o ejecutar el workflow. Es un `findUnique` por llave única, y es lo
   * único que se gasta en un contacto bloqueado.
   */
  async isBlocked(organizationId: string, identifier: EndUserIdentifier): Promise<boolean> {
    const endUser = await this.prismaService.endUser.findUnique({
      where:
        'phoneNumber' in identifier
          ? { organizationId_phoneNumber: { organizationId, phoneNumber: identifier.phoneNumber } }
          : { organizationId_externalId: { organizationId, externalId: identifier.externalId } },
      select: { blockedAt: true },
    });

    return endUser?.blockedAt != null;
  }

  /**
   * Igual que `isBlocked`, pero por id de contacto.
   *
   * La usa `execute()` como última guardia, y no es redundante con la del webhook: entre que
   * llega el mensaje y que la tarea se ejecuta pasan segundos —más los reintentos—, así que un
   * bloqueo hecho en esa ventana ya no lo ve el webhook. Sin esta comprobación, bloquear a
   * alguien que acaba de escribir le regala una respuesta más.
   */
  async isBlockedById(endUserId: string): Promise<boolean> {
    const endUser = await this.prismaService.endUser.findUnique({
      where: { id: endUserId },
      select: { blockedAt: true },
    });

    return endUser?.blockedAt != null;
  }

  /**
   * Bloquea un contacto y cierra sus conversaciones activas.
   *
   * Las dos cosas van en la misma transacción: si el bloqueo queda escrito y el cierre no, la
   * bandeja se queda con una conversación viva que nadie va a contestar nunca.
   *
   * El cierre se hace con Prisma directo en vez de inyectar `ConversationsService` para no
   * acoplar `identity` con `messaging` por una sola escritura.
   */
  async block(
    organizationId: string,
    endUserId: string,
    blockedByUserId: string,
    reason?: string,
  ): Promise<DashboardEndUserDto> {
    await this.assertBelongsToOrganization(organizationId, endUserId);

    const now = new Date();
    const trimmedReason = reason?.trim();

    const [endUser] = await this.prismaService.$transaction([
      this.prismaService.endUser.update({
        where: { id: endUserId },
        data: {
          blockedAt: now,
          // Vacío y ausente significan lo mismo —"sin motivo"—, así que no se guarda "".
          blockedReason: trimmedReason ? trimmedReason : null,
          blockedByUserId,
        },
        select: this.dashboardSelect(),
      }),
      this.prismaService.conversation.updateMany({
        where: { endUserId, status: ConversationStatus.ACTIVE, deletedAt: null },
        data: { status: ConversationStatus.CLOSED, closedAt: now },
      }),
    ]);

    return this.toDashboardDto(endUser);
  }

  /**
   * Desbloquea un contacto.
   *
   * No reabre las conversaciones que el bloqueo cerró: se cerraron porque nadie las iba a
   * atender, y darlas por vivas otra vez llenaría la bandeja de hilos viejos. Si la persona
   * vuelve a escribir, el flujo normal le crea una conversación nueva.
   */
  async unblock(organizationId: string, endUserId: string): Promise<DashboardEndUserDto> {
    await this.assertBelongsToOrganization(organizationId, endUserId);

    const endUser = await this.prismaService.endUser.update({
      where: { id: endUserId },
      data: { blockedAt: null, blockedReason: null, blockedByUserId: null },
      select: this.dashboardSelect(),
    });

    return this.toDashboardDto(endUser);
  }

  /**
   * Aísla por organización antes de escribir.
   *
   * El `update` posterior va por `id` porque es la PK, y sin esta comprobación bastaría con
   * conocer el uuid de un contacto ajeno para bloquearlo desde otra cuenta.
   */
  private async assertBelongsToOrganization(
    organizationId: string,
    endUserId: string,
  ): Promise<void> {
    const endUser = await this.prismaService.endUser.findFirst({
      where: { id: endUserId, organizationId },
      select: { id: true },
    });

    if (!endUser) {
      throw new NotFoundException('Contacto no encontrado');
    }
  }

  private buildBlockedFilter(blocked?: EndUserBlockedFilter): Prisma.EndUserWhereInput {
    if (blocked === 'blocked') return { blockedAt: { not: null } };
    if (blocked === 'active') return { blockedAt: null };
    return {};
  }

  /**
   * Búsqueda por el identificador con el que se conoce al contacto.
   *
   * El teléfono se busca con el término despojado de todo lo que no sea dígito: en la base vive
   * como lo manda el proveedor (`5215512345678`), así que quien teclee `+52 55 1234 5678` no
   * encontraría nada comparando en crudo. Las demás columnas sí se buscan literales.
   */
  private buildSearchFilter(search?: string): Prisma.EndUserWhereInput {
    const term = search?.trim();
    if (!term) return {};

    const digits = term.replace(/\D/g, '');

    return {
      OR: [
        { name: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { externalId: { contains: term, mode: 'insensitive' } },
        ...(digits ? [{ phoneNumber: { contains: digits } }] : []),
      ],
    };
  }

  private dashboardSelect() {
    return {
      id: true,
      phoneNumber: true,
      email: true,
      externalId: true,
      name: true,
      avatar: true,
      metadata: true,
      lastSeenAt: true,
      createdAt: true,
      blockedAt: true,
      blockedReason: true,
      ...BLOCKED_BY_INCLUDE,
    } satisfies Prisma.EndUserSelect;
  }

  private toDashboardDto(
    endUser: Omit<DashboardEndUserDto, 'blockedByName' | 'metadata'> & {
      metadata: Prisma.JsonValue;
      blockedBy: { name: string } | null;
    },
  ): DashboardEndUserDto {
    const { blockedBy, metadata, ...rest } = endUser;

    return {
      ...rest,
      // `metadata` es JsonB libre, así que Prisma lo tipa como `JsonValue` —que admite números,
      // cadenas y booleanos— mientras que el DTO promete un objeto. Lo que guardamos siempre es
      // un objeto; el filtro está para que un valor suelto no viaje con una forma que el cliente
      // no espera.
      metadata: metadata !== null && typeof metadata === 'object' ? (metadata as object) : null,
      blockedByName: blockedBy?.name ?? null,
    };
  }
}
