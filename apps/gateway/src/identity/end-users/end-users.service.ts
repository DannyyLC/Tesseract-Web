import { PrismaService } from '@/platform/database/prisma.service';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConversationStatus, Prisma } from '@tesseract/database';
import {
  DEFAULT_PAGE_SIZE,
  DashboardEndUserDto,
  EndUserBlockedFilter,
  PaginatedResponse,
} from '@tesseract/types';
import { CursorPaginatedResponseUtils } from '@/platform/common/responses/cursor-paginated-response';
import { normalizePhone } from '@/platform/common/utils/normalize-phone';

/** Nombre de quien bloqueó: viaja en el DTO para no obligar al cliente a cruzarlo por su cuenta. */
const BLOCKED_BY_INCLUDE = { blockedBy: { select: { name: true } } } as const;

/**
 * Cómo se identifica a un contacto en el canal por el que llega.
 *
 * Son las dos llaves únicas de `EndUser`. El externalId de Messenger (`messenger:<pageId>:<psid>`)
 * se guarda tal cual llega. El teléfono de WhatsApp NO: `isBlocked()` lo normaliza a `+dígitos`
 * antes de buscarlo, porque así vive `EndUser.phoneNumber` (ver `normalizePhone()`) — un llamador
 * puede pasar el número crudo del webhook sin preocuparse por el formato.
 */
export type EndUserIdentifier = { phoneNumber: string } | { externalId: string };

@Injectable()
export class EndUsersService {
  constructor(private readonly prismaService: PrismaService) {}

  async getDashboardData(
    idOrganization: string,
    cursor: string | null = null,
    pageSize = DEFAULT_PAGE_SIZE,
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
   * Da de alta un contacto de WhatsApp a mano, sin esperar a que escriba primero.
   *
   * Queda fuera de la ruta del webhook a propósito: ahí un `upsert` nunca falla porque
   * cualquier mensaje entrante es bienvenido. Aquí sí debe fallar si el número ya existe —
   * darlo de alta "otra vez" le pisaría el nombre y el historial que ya tiene ese contacto.
   *
   * `phoneNumber` llega ya normalizado (`+dígitos`) por `CreateEndUserDto`, en la misma forma
   * canónica que escribe el webhook: es lo que hace posible el match cuando esa persona
   * escriba de verdad.
   */
  async createFromPhoneNumber(
    organizationId: string,
    phoneNumber: string,
    name?: string,
  ): Promise<DashboardEndUserDto> {
    try {
      const trimmedName = name?.trim();
      const endUser = await this.prismaService.endUser.create({
        // Vacío y ausente significan lo mismo —"sin nombre"—, así que no se guarda "".
        data: { organizationId, phoneNumber, name: trimmedName ? trimmedName : null },
        select: this.dashboardSelect(),
      });

      return this.toDashboardDto(endUser);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya existe un contacto con ese número');
      }

      throw error;
    }
  }

  /**
   * ¿Hay que descartar lo que mande este contacto?
   *
   * La consultan los webhooks de cada canal ANTES de bufferear el mensaje, agendar la tarea,
   * transcribir el audio o ejecutar el workflow. Es un `findUnique` por llave única, y es lo
   * único que se gasta en un contacto bloqueado.
   *
   * El teléfono se normaliza aquí adentro, no en cada llamador: el webhook manda el número
   * crudo tal como lo entrega WhatsApp, pero `EndUser.phoneNumber` vive en la forma canónica
   * de `normalizePhone()` — sin normalizar, el `findUnique` nunca encontraría la fila.
   */
  async isBlocked(organizationId: string, identifier: EndUserIdentifier): Promise<boolean> {
    const endUser = await this.prismaService.endUser.findUnique({
      where:
        'phoneNumber' in identifier
          ? {
              organizationId_phoneNumber: {
                organizationId,
                phoneNumber: normalizePhone(identifier.phoneNumber) ?? identifier.phoneNumber,
              },
            }
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
   * Cambia el nombre con el que se conoce al contacto.
   *
   * Es el único campo editable a propósito: el teléfono, el email y el externalId son la
   * identidad del contacto en su canal, y editarlos rompería el match con los mensajes que ya
   * le llegaron.
   */
  async update(
    organizationId: string,
    endUserId: string,
    name: string,
  ): Promise<DashboardEndUserDto> {
    await this.assertBelongsToOrganization(organizationId, endUserId);

    const endUser = await this.prismaService.endUser.update({
      where: { id: endUserId },
      data: { name: name.trim() },
      select: this.dashboardSelect(),
    });

    return this.toDashboardDto(endUser);
  }

  /**
   * Elimina el contacto para siempre.
   *
   * A diferencia de bloquear, aquí no hay vuelta atrás: el schema tiene `onDelete: Cascade`
   * de `Conversation` hacia `EndUser`, así que esto se lleva entre también todas sus
   * conversaciones y mensajes. Quien solo quiera dejar de atenderlo debe bloquearlo, no
   * borrarlo.
   */
  async remove(organizationId: string, endUserId: string): Promise<void> {
    await this.assertBelongsToOrganization(organizationId, endUserId);
    await this.prismaService.endUser.delete({ where: { id: endUserId } });
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
   * El teléfono se busca con el término despojado de todo lo que no sea dígito y por
   * subcadena: el `+` con el que vive `EndUser.phoneNumber` (ver `normalizePhone()`) es solo
   * el primer carácter, así que buscar los puros dígitos lo sigue encontrando sin tener que
   * saber si quien tecleó incluyó el `+` o no. Las demás columnas sí se buscan literales.
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
