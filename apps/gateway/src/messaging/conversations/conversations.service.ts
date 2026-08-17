import { Injectable, Logger, ForbiddenException, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '@/platform/database/prisma.service';
import {
  DashboardConversationDto,
  ConversationsStatsDto as ConversationStatsDto,
  NOTIFICATIONSENUM,
  UserRole,
} from '@tesseract/types';
import { CursorPaginatedResponseUtils } from '@/platform/common/responses/cursor-paginated-response';
import { PaginatedResponse } from '@tesseract/types';
import {
  ConversationChannel,
  ConversationStatus,
  ChatRole,
  CompactionStatus,
  MessengerConfig,
  ExecutionStatus,
} from '@tesseract/database';
import { UtilityService } from '@/platform/utility/utility.service';
import { buildConversationTitle } from './conversation-title';
import { messengerExternalId } from '@/platform/common/utils/messenger-external-id';
import { KmsService } from '@/automation/tools/core/kms.service';
import { firstValueFrom } from 'rxjs';

const GRAPH_API_BASE = process.env.MESSENGER_GRAPH_API_BASE ?? 'https://graph.facebook.com/v21.0';

interface CreateCompactionInput {
  conversationId: string;
  summary?: string | null;
  sourceMessageFromId?: string;
  sourceMessageToId?: string;
  tokensBefore: number;
  tokensAfter: number;
  compressionRatio: number;
  modelUsed: string;
  status: CompactionStatus;
  error?: string;
}

interface MessageAttachmentInput {
  type: 'IMAGE' | 'AUDIO';
  mimeType: string;
  sourceUrl: string;
  sizeBytes?: number;
  sha256?: string;
  contentHash?: string;
  processingStatus?: 'PENDING' | 'PROCESSING' | 'PROCESSED' | 'FAILED' | 'UNSUPPORTED';
  processedText?: string;
  processedAt?: Date;
  processingError?: string;
  processor?: string;
  processorVersion?: string;
  metadata?: any;
}

/**
 * ConversationsService
 *
 * Servicio centralizado para la gestión de conversaciones.
 * Maneja la creación, búsqueda y gestión del estado de conversaciones
 * entre usuarios y workflows, soportando múltiples canales de comunicación.
 */
@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);
  private readonly defaultCompactionLockTtlMs = 30_000;

  private resolveChannel(channel: string): ConversationChannel {
    const map: Record<string, ConversationChannel> = {
      DASHBOARD: ConversationChannel.DASHBOARD,
      WHATSAPP: ConversationChannel.WHATSAPP,
      WEB: ConversationChannel.WEB,
      API: ConversationChannel.API,
      CRON: ConversationChannel.CRON,
      MESSENGER: ConversationChannel.MESSENGER,
    };
    return map[channel?.toUpperCase()] ?? ConversationChannel.API;
  }

  private resolveInactivityHours(workflowHours?: number | null, orgHours?: number | null) {
    if (workflowHours != null) return workflowHours;
    if (orgHours != null) return orgHours;
    return null;
  }

  private calculateAutoCloseAt(baseDate: Date, inactivityHours: number | null) {
    if (inactivityHours == null || inactivityHours <= 0) {
      return null;
    }

    return new Date(baseDate.getTime() + inactivityHours * 60 * 60 * 1000);
  }

  private async getAutoCloseContext(organizationId: string, id: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null,
        // update() depende de esta consulta para el ownership check: sin este filtro,
        // el cliente podría modificar una conversación de un workflow interno que ni
        // siquiera puede ver en su listado o en findOne().
        isInternalWorkflow: false,
      },
      select: {
        userId: true,
        lastMessageAt: true,
        workflow: {
          select: {
            inactivityHours: true,
          },
        },
        organization: {
          select: {
            defaultInactivityHours: true,
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation with ID ${id} not found`);
    }

    return conversation;
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly utilityService: UtilityService,
    private readonly httpService: HttpService,
    private readonly kmsService: KmsService,
  ) {}

  private async resolveMessengerPageAccessToken(config: {
    pageId: string;
    pageAccessToken: string | null;
  }): Promise<string> {
    if (config.pageAccessToken) {
      try {
        return await this.kmsService.decrypt(config.pageAccessToken);
      } catch (error) {
        this.logger.error(
          `No se pudo descifrar el token de Messenger de la página ${config.pageId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    
    return '';
  }

  private async fetchMessengerSenderName(
    config: { pageId: string; pageAccessToken: string | null },
    senderId: string,
  ): Promise<string | null> {
    try {
      const accessToken = await this.resolveMessengerPageAccessToken(config);
      const { data } = await firstValueFrom(
        this.httpService.get<{ name?: string; first_name?: string; last_name?: string }>(
          `${GRAPH_API_BASE}/${senderId}`,
          {
            params: {
              fields: 'name,first_name,last_name',
              access_token: accessToken,
            },
          },
        ),
      );

      const fullName = data?.name?.trim();
      if (fullName) return fullName;

      const joinedName = [data?.first_name, data?.last_name].filter(Boolean).join(' ').trim();
      return joinedName || null;
    } catch (error) {
      this.logger.warn(
        `No se pudo resolver el nombre del remitente ${senderId} para la página ${config.pageId}`,
      );
      return null;
    }
  }

  async requestHumanIntervention(
    organizationId: string,
    conversationId: string,
    reason?: string,
  ): Promise<void> {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        organizationId,
        deletedAt: null,
      },
      select: {
        id: true,
        workflowId: true,
        userId: true,
        endUserId: true,
        isHumanInTheLoop: true,
      },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation with ID ${conversationId} not found`);
    }

    if (conversation.userId || !conversation.endUserId) {
      throw new ForbiddenException(
        'Human intervention can only be requested for EndUser conversations',
      );
    }

    if (conversation.isHumanInTheLoop) {
      return;
    }

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { isHumanInTheLoop: true },
    });

    const safeReason = reason?.trim() || 'Necesita atencion humana';
    await this.utilityService.sendNotificationToAppClients(
      organizationId,
      [UserRole.OWNER, UserRole.ADMIN],
      (NOTIFICATIONSENUM as any).HUMAN_INTERVENTION_REQUIRED ?? '0000-0114',
      [conversation.id, conversation.workflowId, safeReason],
    );
  }

  /**
   * Marca la conversación como pendiente de seguimiento por parte del equipo.
   *
   * Es una señal genérica de la plataforma: cualquier workflow la levanta dejando
   * `requires_follow_up: true` en sus variables persistidas, sin importar el canal
   * ni el motivo. La marca NO se apaga sola — que el workflow deje de pedirla no
   * significa que alguien ya haya contactado al cliente; se apaga desde la UI.
   *
   * Idempotente: si ya estaba marcada, no vuelve a notificar.
   */
  async markNeedsFollowUp(
    organizationId: string,
    conversationId: string,
    reason?: string,
  ): Promise<void> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, organizationId, deletedAt: null },
      select: { id: true, workflowId: true, needsFollowUp: true },
    });

    if (!conversation || conversation.needsFollowUp) {
      return;
    }

    const safeReason = reason?.trim() || 'Requiere seguimiento del equipo';

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { needsFollowUp: true, followUpReason: safeReason },
    });

    await this.utilityService.sendNotificationToAppClients(
      organizationId,
      [UserRole.OWNER, UserRole.ADMIN],
      (NOTIFICATIONSENUM as any).CONVERSATION_NEEDS_FOLLOW_UP ?? '0000-0115',
      [conversation.id, conversation.workflowId, safeReason],
    );
  }

  /**
   * Busca o crea una conversación para la ejecución
   *
   * @param workflowId - ID del workflow
   * @param channel - Canal de comunicación (api, whatsapp, web, dashboard)
   * @param userId - ID del usuario interno (opcional)
   * @param endUserId - ID del usuario externo (opcional)
   * @param conversationId - ID de conversación existente (opcional)
   * @param isInternalWorkflow - Copia congelada de `Workflow.isInternal` en el momento de
   *   crear la conversación (la pasa `WorkflowsService`). No se recalcula: si el workflow se
   *   publica después, esta fila sigue marcada como estaba cuando se creó.
   * @returns Conversación existente o nueva
   */
  async findOrCreateConversation(
    workflowId: string,
    channel: string,
    userId?: string,
    endUserId?: string,
    conversationId?: string,
    isInternalWorkflow = false,
  ) {
    // Si viene un conversationId, buscar esa conversación
    if (conversationId) {
      const existing = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
      });

      if (existing) {
        this.logger.debug(`Usando conversación existente: ${conversationId}`);
        return existing;
      }
    }

    // Obtener la organización del workflow para asignarla a la conversación
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { organizationId: true },
    });

    if (!workflow) {
      throw new Error(`Workflow no encontrado: ${workflowId}`);
    }

    // Si no existe o no viene conversationId, crear una nueva
    const newConversation = await this.prisma.conversation.create({
      data: {
        workflowId,
        organizationId: workflow.organizationId, // Asignación obligatoria
        channel: this.resolveChannel(channel),
        userId,
        endUserId,
        status: ConversationStatus.ACTIVE,
        messageCount: 0,
        totalTokens: 0,
        totalCost: 0,
        // El listado ordena por `lastMessageAt`: dejarlo en NULL mandaria la
        // conversacion al tope. Hasta que llegue el primer mensaje vale su creacion.
        lastMessageAt: new Date(),
        isInternalWorkflow,
      },
    });

    this.logger.log(`Nueva conversación creada: ${newConversation.id}`);
    return newConversation;
  }

  /**
   * Conversación activa de un número de WhatsApp, sin crearla si no existe.
   *
   * Es el mismo predicado que usa `findOrCreateConversationFromWhatsAppMessage`, y por eso
   * vive aquí en vez de duplicarse: el worker consulta esta conversación *antes* de procesar
   * la ventana para saber si está intervenida, y si los dos `where` se separaran, el worker
   * decidiría sobre una conversación distinta de la que después se ejecuta.
   *
   * El filtro `deletedAt: null` no es opcional: sin él se reutiliza una conversación borrada
   * desde la UI, y como `findOne` sí descarta las borradas, el flujo del webhook terminaba
   * lanzando NotFoundException y no enviando la respuesta. En la práctica, borrar una
   * conversación dejaba ese número sin servicio para siempre.
   */
  async findActiveWhatsappConversation(whatsappConfigId: string, userNumber: string) {
    return this.prisma.conversation.findFirst({
      where: {
        channel: ConversationChannel.WHATSAPP,
        whatsappConfigId,
        phoneNumberSender: userNumber,
        status: ConversationStatus.ACTIVE,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOrCreateConversationFromWhatsAppMessage(
    workflowId: string,
    phoneNumber: string,
    userNumber: string,
    isInternalWorkflow = false,
  ) {
    const whatsappConfig = await this.prisma.whatsAppConfig.findUnique({
      where: { phoneNumber },
    });
    if (!whatsappConfig) {
      throw new Error(`WhatsApp config no encontrada para número: ${phoneNumber}`);
    }

    const existing = await this.findActiveWhatsappConversation(whatsappConfig.id, userNumber);

    if (existing) {
      this.logger.debug(
        `Usando conversación existente para WhatsApp ${userNumber} -> ${phoneNumber} (config ${whatsappConfig.id})`,
      ); //TODO; Remove when sending to prod
      return existing;
    }

    // Obtener la organización del workflow para asignarla a la conversación
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { organizationId: true },
    });

    if (!workflow) {
      throw new Error(`Workflow no encontrado: ${workflowId}`);
    }

    // Encontrar o crear el EndUser por número de teléfono (requerido por constraint XOR)
    const endUser = await this.prisma.endUser.upsert({
      where: {
        organizationId_phoneNumber: {
          organizationId: workflow.organizationId,
          phoneNumber: userNumber,
        },
      },
      create: {
        organizationId: workflow.organizationId,
        phoneNumber: userNumber,
        lastSeenAt: new Date(),
      },
      update: {
        lastSeenAt: new Date(),
      },
    });

    // Si no existe, crear una nueva conversación para este número de WhatsApp
    const newConversation = await this.prisma.conversation.create({
      data: {
        workflowId,
        organizationId: workflow.organizationId,
        channel: ConversationChannel.WHATSAPP,
        whatsappConfigId: whatsappConfig.id,
        phoneNumberSender: userNumber,
        endUserId: endUser.id, // Requerido por constraint conversations_user_xor_enduser
        status: ConversationStatus.ACTIVE,
        messageCount: 0,
        totalTokens: 0,
        totalCost: 0,
        // Ver nota en findOrCreateConversation: NULL flotaria al tope del listado.
        lastMessageAt: new Date(),
        isInternalWorkflow,
      },
    });

    return newConversation;
  }

  /**
   * Busca o crea la conversación de un usuario de Messenger.
   *
   * Gemelo de `findOrCreateConversationFromWhatsAppMessage`: la pareja (página, PSID)
   * hace el papel de (número propio, número del cliente). El PSID solo tiene sentido
   * dentro de su página, así que ambos hacen falta para identificar a una persona.
   */
  async findOrCreateConversationFromMessengerMessage(
    workflowId: string,
    pageId: string,
    senderId: string,
    isInternalWorkflow = false,
  ) {
    const messengerConfig = await this.prisma.messengerConfig.findUnique({
      where: { pageId },
    });
    if (!messengerConfig) {
      throw new Error(`Messenger config no encontrada para la página: ${pageId}`);
    }

    // El filtro `deletedAt: null` no es opcional: sin él se reutiliza una conversación
    // borrada desde la UI y, como `findOne` sí descarta las borradas, el flujo del
    // webhook termina lanzando NotFoundException y sin enviar la respuesta.
    const existing = await this.prisma.conversation.findFirst({
      where: {
        channel: ConversationChannel.MESSENGER,
        messengerConfigId: messengerConfig.id,
        messengerSenderId: senderId,
        status: ConversationStatus.ACTIVE,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      this.logger.debug(
        `Usando conversación existente para Messenger ${senderId} -> ${pageId} (config ${messengerConfig.id})`,
      );
      return existing;
    }

    // Obtener la organización del workflow para asignarla a la conversación
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { organizationId: true },
    });

    if (!workflow) {
      throw new Error(`Workflow no encontrado: ${workflowId}`);
    }

    // El PSID no es un teléfono ni un email: encaja en `externalId`, que es el
    // identificador libre del EndUser. Se prefija con la página porque el mismo PSID
    // puede repetirse entre páginas distintas.
    const externalId = messengerExternalId(pageId, senderId);

    const endUser = await this.prisma.endUser.upsert({
      where: {
        organizationId_externalId: {
          organizationId: workflow.organizationId,
          externalId,
        },
      },
      create: {
        organizationId: workflow.organizationId,
        externalId,
        lastSeenAt: new Date(),
      },
      update: {
        lastSeenAt: new Date(),
      },
    });

    const newConversation = await this.prisma.conversation.create({
      data: {
        workflowId,
        organizationId: workflow.organizationId,
        channel: ConversationChannel.MESSENGER,
        messengerConfigId: messengerConfig.id,
        messengerSenderId: senderId,
        endUserId: endUser.id, // Requerido por constraint conversations_user_xor_enduser
        status: ConversationStatus.ACTIVE,
        messageCount: 0,
        totalTokens: 0,
        totalCost: 0,
        // Igual que el alta genérica y la de WhatsApp: el listado ordena por
        // `lastMessageAt` con los NULL al final, así que dejarlo vacío mandaría la
        // conversación recién creada al fondo y la pintaría como "hora desconocida".
        lastMessageAt: new Date(),
        isInternalWorkflow,
      },
    });

    return newConversation;
  }

  /**
   * Obtiene una conversación por ID con todos sus detalles (incluyendo mensajes)
   *
   * @param organizationId - ID de la organización
   * @param id - ID de la conversación
   */
  async findOne(organizationId: string, id: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null,
        // Igual que findAll(): una conversación de un workflow interno no debe ser
        // legible por el cliente aunque conozca su id.
        isInternalWorkflow: false,
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            attachments: true,
          },
        },
        endUser: {
          select: { phoneNumber: true, name: true, blockedAt: true, blockedReason: true },
        },
        messengerConfig: { select: { pageName: true } },
      },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation with ID ${id} not found`);
    }

    return {
      ...conversation,
      endUserPhoneNumber: conversation.endUser?.phoneNumber ?? null,
      endUserName: conversation.endUser?.name ?? null,
      endUserBlockedAt: conversation.endUser?.blockedAt ?? null,
      endUserBlockedReason: conversation.endUser?.blockedReason ?? null,
      messengerPageName: conversation.messengerConfig?.pageName ?? null,
    };
  }

  /**
   * Actualiza una conversación (Método unificado)
   *
   * @param id - ID de la conversación
   * @param data - Datos a actualizar (compatible con PrismaUpdateInput)
   */
  async update(organizationId: string, id: string, data: any) {
    // 1. Verificar ownership y obtener contexto mínimo para reglas de autocierre
    const currentConversation = await this.getAutoCloseContext(organizationId, id);

    // RESTRICCIÓN HITL: Si es usuario interno (userId != null), no puede modificar isHumanInTheLoop
    if (data.isHumanInTheLoop !== undefined) {
      if (currentConversation.userId) {
        // Es una conversación interna (User), no debería tener HITL activado manualmente
        throw new ForbiddenException('Internal users cannot toggle Human in the Loop');
      }
    }

    const updateData = { ...data };

    // Al apagar la marca de seguimiento se limpia también el motivo: quedó atendida
    // y conservarlo confundiría si el workflow la vuelve a levantar por otra razón.
    if (updateData.needsFollowUp === false) {
      updateData.followUpReason = null;
    }

    if (typeof updateData.status === 'string') {
      const normalizedStatus = updateData.status.toUpperCase();

      if (normalizedStatus === ConversationStatus.CLOSED) {
        updateData.status = ConversationStatus.CLOSED;
        updateData.closedAt = updateData.closedAt ?? new Date();
        updateData.autoCloseAt = null;
      }

      if (normalizedStatus === ConversationStatus.ACTIVE) {
        const inactivityHours = this.resolveInactivityHours(
          currentConversation.workflow?.inactivityHours,
          currentConversation.organization?.defaultInactivityHours,
        );

        updateData.status = ConversationStatus.ACTIVE;
        updateData.closedAt = null;
        updateData.autoCloseAt = currentConversation.lastMessageAt
          ? this.calculateAutoCloseAt(currentConversation.lastMessageAt, inactivityHours)
          : null;
      }
    }

    const conversation = await this.prisma.conversation.update({
      where: { id },
      data: updateData,
    });

    this.logger.debug(`Conversación ${id} actualizada: ${JSON.stringify(updateData)}`);
    return conversation;
  }

  // ============================================
  // ADMIN (super admin, cross-organización)
  // ============================================
  /**
   * Lista las conversaciones de un workflow para el super admin.
   *
   * A diferencia de findAll() (dashboard del cliente), NO excluye las de workflows
   * internos —son justo las que un admin necesita revisar, no solo las de "Probar"— ni
   * aplica la prioridad HITL, que es un concepto de bandeja de soporte sin sentido acá.
   *
   * `onlyErrors` filtra las que tienen al menos una ejecución FAILED: es el caso de uso
   * principal — cuando el workflow funciona bien no hay nada que rastrear, así que no
   * vale la pena revisar el resto.
   */
  async findAllForAdmin(params: {
    organizationId: string;
    workflowId: string;
    cursor?: string | null;
    take?: number;
    onlyErrors?: boolean;
  }): Promise<PaginatedResponse<any>> {
    const { organizationId, workflowId, cursor, take = 20, onlyErrors } = params;

    const conversations = await this.prisma.conversation.findMany({
      take: take + 1,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      where: {
        organizationId,
        workflowId,
        deletedAt: null,
        ...(onlyErrors && { executions: { some: { status: ExecutionStatus.FAILED } } }),
      },
      // Mismo orden y desempate que findAll(): último mensaje primero, NULL al final,
      // `id` como desempate final para que el cursor no salte ni repita filas.
      orderBy: [
        { lastMessageAt: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      include: {
        _count: { select: { executions: { where: { status: ExecutionStatus.FAILED } } } },
        user: { select: { name: true } },
        endUser: { select: { name: true, phoneNumber: true } },
      },
    });

    const paginated = await CursorPaginatedResponseUtils.getInstance().build(
      conversations as any,
      take,
    );

    return {
      ...paginated,
      items: paginated.items.map((c: any) => ({
        id: c.id,
        title: c.title,
        channel: c.channel,
        status: c.status,
        messageCount: c.messageCount,
        lastMessageAt: c.lastMessageAt,
        createdAt: c.createdAt,
        hasError: c._count.executions > 0,
        authorName: c.user?.name ?? c.endUser?.name ?? c.endUser?.phoneNumber ?? null,
      })),
    };
  }

  /**
   * Detalle completo de una conversación para el super admin: mensajes en orden y, por
   * cada uno, la ejecución que lo produjo (con error/stack/costo/tokens) — lo mismo que
   * se ve en vivo en la pestaña Probar, reconstruido de lo ya guardado.
   */
  async findOneForAdmin(organizationId: string, workflowId: string, id: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, organizationId, workflowId, deletedAt: null },
      include: {
        // SYSTEM/TOOL no se muestran en el hilo en vivo tampoco — mismo criterio acá.
        messages: {
          where: { role: { in: [ChatRole.USER, ChatRole.ASSISTANT] } },
          orderBy: { createdAt: 'asc' },
        },
        executions: {
          orderBy: { startedAt: 'asc' },
          select: {
            id: true,
            status: true,
            startedAt: true,
            finishedAt: true,
            duration: true,
            error: true,
            errorStack: true,
            cost: true,
            tokensUsed: true,
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation with ID ${id} not found`);
    }

    return conversation;
  }

  /**
   * Renombra una conversación desde el panel de admin. No reusa update(): esa trae
   * reglas de HITL/autocierre que no aplican a un simple cambio de título, y su ownership
   * check (getAutoCloseContext) excluye workflows internos, que es justo lo que el admin
   * necesita poder tocar.
   */
  async renameForAdmin(organizationId: string, id: string, title: string) {
    const result = await this.prisma.conversation.updateMany({
      where: { id, organizationId },
      data: { title },
    });

    if (result.count === 0) {
      throw new NotFoundException(`Conversation with ID ${id} not found`);
    }
  }

  /**
   * Obtiene una lista de conversaciones con filtros opcionales
   * Retorna resumen (sin mensajes o solo el último)
   */
  async findAll(params: {
    cursor?: string | null;
    take?: number;
    paginationAction: 'next' | 'prev' | null;
    isHumanInTheLoop?: boolean;
    needsFollowUp?: boolean;
    status?: string;
    prioritizeHitl?: boolean;
    organizationId: string;
    workflowId?: string;
    userId?: string;
    /** Lista ya validada contra el enum. Vacía o ausente = todos los canales. */
    channels?: ConversationChannel[];
  }): Promise<PaginatedResponse<DashboardConversationDto>> {
    const {
      cursor,
      take,
      paginationAction,
      isHumanInTheLoop,
      needsFollowUp,
      status,
      prioritizeHitl = true,
      organizationId,
      workflowId,
      userId,
      channels,
    } = params;

    // Recencia real de la conversacion: manda el ultimo mensaje, no cuando se creo.
    // Los NULL van explicitamente al final porque Postgres los pondria primero en un
    // DESC, y eso empujaba al tope las conversaciones que nunca recibieron mensajes.
    // El `id` cierra el orden: sin un desempate unico la paginacion por cursor puede
    // saltarse o repetir filas cuando dos conversaciones empatan en todo lo demas.
    const recency = [
      { lastMessageAt: { sort: 'desc' as const, nulls: 'last' as const } },
      { createdAt: 'desc' as const },
      { id: 'desc' as const },
    ];

    // Las que piden accion humana van primero: intervenidas, luego pendientes de
    // seguimiento, y solo entonces el resto por recencia.
    const orderBy = prioritizeHitl
      ? [
          { isHumanInTheLoop: 'desc' as const },
          { needsFollowUp: 'desc' as const },
          { status: 'asc' as const },
          ...recency,
        ]
      : recency;

    const conversations = await this.prisma.conversation.findMany({
      take:
        paginationAction === 'next' || paginationAction === null
          ? (take ?? 10) + 1
          : -((take ?? 10) + 1),
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      where: {
        isHumanInTheLoop,
        needsFollowUp,
        ...(status && { status: status.toUpperCase() as any }),
        // Una lista vacía en un `in` no devolveria nada, asi que ausente y vacia tienen
        // que significar lo mismo: sin filtro de canal.
        ...(channels?.length && { channel: { in: channels } }),
        organizationId,
        workflowId,
        userId,
        deletedAt: null,
        // Un workflow interno de super admin no es del cliente: sin este filtro, una
        // conversación de prueba aparecía en el dashboard del cliente mientras el
        // workflow seguía oculto en todo lo demás.
        isInternalWorkflow: false,
      },
      orderBy,
      // El `where` ya fuerza `isInternalWorkflow: false`, pero igual no debe llegar sin
      // tipar hasta `DashboardConversationDto` — se excluye aquí en vez de traerla y
      // descartarla a mano después.
      omit: { isInternalWorkflow: true },
      include: {
        user: { select: { name: true, email: true, avatar: true } },
        endUser: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            phoneNumber: true,
            blockedAt: true,
          },
        },
        messengerConfig: { select: { pageName: true, pageId: true, pageAccessToken: true } },
        whatsappConfig: { select: { phoneNumber: true } },
      },
    });

    // Sin el genérico explícito: `omit` cambia el tipo real de `conversations` (ya no
    // trae `isInternalWorkflow`), y build() solo necesita `{ id: string }` — se infiere
    // solo del argumento en vez de forzar el tipo completo de `Conversation`.
    const paginatedResult = await CursorPaginatedResponseUtils.getInstance().build(
      conversations,
      take ?? 10,
      paginationAction,
    );

    const items = await Promise.all(
      paginatedResult.items.map(async (c: any) => {
        let endUserName = c.endUser?.name ?? null;

        if (
          c.channel === ConversationChannel.MESSENGER &&
          !endUserName &&
          c.messengerSenderId &&
          c.messengerConfig
        ) {
          const fetchedName = await this.fetchMessengerSenderName(c.messengerConfig, c.messengerSenderId);
          if (fetchedName) {
            endUserName = fetchedName;
            if (c.endUser?.id) {
              try {
                await this.prisma.endUser.update({
                  where: { id: c.endUser.id },
                  data: { name: fetchedName },
                });
              } catch (error) {
                this.logger.warn(`No se pudo persistir el nombre del remitente ${c.messengerSenderId}`);
              }
            }
          }
        }

        return {
          ...c,
          isInternal: !!c.userId,
          endUserPhoneNumber: c.endUser?.phoneNumber ?? null,
          whatsappBusinessPhoneNumber: c.whatsappConfig?.phoneNumber ?? null,
          endUserName,
          endUserBlockedAt: c.endUser?.blockedAt ?? null,
          messengerPageName: c.messengerConfig?.pageName ?? null,
          messengerSenderId: c.messengerSenderId ?? null,
        };
      }),
    );

    return {
      ...paginatedResult,
      items: items as DashboardConversationDto[],
    };
  }

  /**
   * Obtiene el historial de mensajes de una conversación
   *
   * @param conversationId - ID de la conversación
   * @returns Array de mensajes ordenados cronológicamente
   */
  async getMessageHistory(conversationId: string) {
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: {
        role: true,
        content: true,
        attachments: {
          select: {
            type: true,
            processingStatus: true,
            processedText: true,
          },
        },
      },
    });

    return messages.map((message) => {
      const processedMediaLines = message.attachments
        .filter(
          (attachment) =>
            attachment.processingStatus === 'PROCESSED' &&
            Boolean(attachment.processedText?.trim()) &&
            // Para audio, el contenido del mensaje YA es la transcripción; agregarla
            // otra vez le mandaba al agente el mismo texto dos veces, en cada turno.
            attachment.processedText!.trim() !== message.content?.trim(),
        )
        .map(
          (attachment) => `[${attachment.type.toLowerCase()}] ${attachment.processedText!.trim()}`,
        );

      if (processedMediaLines.length === 0) {
        return {
          role: message.role,
          content: message.content,
        };
      }

      const mediaContext = processedMediaLines.join('\n');
      const enrichedContent = message.content?.trim()
        ? `${message.content}\n\n${mediaContext}`
        : mediaContext;

      return {
        role: message.role,
        content: enrichedContent,
      };
    });
  }

  /**
   * Obtiene historial de mensajes con IDs para trazabilidad de compactación.
   */
  async getMessageHistoryWithIds(conversationId: string) {
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        content: true,
        attachments: {
          select: {
            type: true,
            processingStatus: true,
            processedText: true,
          },
        },
      },
    });

    return messages.map((message) => {
      const processedMediaLines = message.attachments
        .filter(
          (attachment) =>
            attachment.processingStatus === 'PROCESSED' &&
            Boolean(attachment.processedText?.trim()) &&
            // Para audio, el contenido del mensaje YA es la transcripción; agregarla
            // otra vez le mandaba al agente el mismo texto dos veces, en cada turno.
            attachment.processedText!.trim() !== message.content?.trim(),
        )
        .map(
          (attachment) => `[${attachment.type.toLowerCase()}] ${attachment.processedText!.trim()}`,
        );

      if (processedMediaLines.length === 0) {
        return {
          id: message.id,
          role: message.role,
          content: message.content,
        };
      }

      const mediaContext = processedMediaLines.join('\n');
      const enrichedContent = message.content?.trim()
        ? `${message.content}\n\n${mediaContext}`
        : mediaContext;

      return {
        id: message.id,
        role: message.role,
        content: enrichedContent,
      };
    });
  }

  /**
   * Agrega un nuevo mensaje a la conversación
   *
   * @param conversationId - ID de la conversación
   * @param role - Rol del mensaje (human, assistant, system)
   * @param content - Contenido del mensaje
   * @returns Mensaje creado
   */
  async addMessage(
    conversationId: string,
    role: ChatRole,
    content: string,
    metadata?: any,
    attachments?: MessageAttachmentInput[],
  ) {
    const message = await this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.findUnique({
        where: { id: conversationId },
        select: {
          organizationId: true,
          title: true,
          workflow: {
            select: {
              inactivityHours: true,
            },
          },
          organization: {
            select: {
              defaultInactivityHours: true,
            },
          },
        },
      });

      if (!conversation) {
        throw new NotFoundException(`Conversation with ID ${conversationId} not found`);
      }

      const createdMessage = await tx.message.create({
        data: {
          conversationId,
          organizationId: conversation.organizationId,
          role: role === ChatRole.USER ? ChatRole.USER : role,
          content,
          metadata: metadata ?? undefined,
          attachments:
            attachments && attachments.length > 0
              ? {
                  create: attachments.map((attachment) => ({
                    organizationId: conversation.organizationId,
                    ...attachment,
                  })),
                }
              : undefined,
        },
        include: {
          attachments: true,
        },
      });

      const messageTimestamp = new Date();
      const inactivityHours = this.resolveInactivityHours(
        conversation.workflow?.inactivityHours,
        conversation.organization?.defaultInactivityHours,
      );

      // Título automático con el primer mensaje del usuario. Aquí y no en cada canal
      // porque `addMessage` es por donde pasan todos: mientras esto vivió en el
      // navegador, solo las conversaciones creadas desde el panel llegaban a tener
      // nombre. Solo el primero: los siguientes renombrarían la conversación sola, y un
      // título puesto a mano se respeta siempre.
      const generatedTitle =
        !conversation.title && role === ChatRole.USER ? buildConversationTitle(content) : null;

      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          ...(generatedTitle && { title: generatedTitle }),
          lastMessageAt: messageTimestamp,
          lastMessageRole: role === ChatRole.USER ? ChatRole.USER : role, // Normalize 'human' to 'user' if needed by schema enum, or keep string
          autoCloseAt: this.calculateAutoCloseAt(messageTimestamp, inactivityHours),
          // messageCount increment removed to avoid double counting with batchUpdate
        },
      });

      return createdMessage;
    }, {
      // Cloud Run puede throttlear CPU entre ticks del event loop cuando la
      // instancia no está atendiendo activamente la request, lo que puede
      // inflar el tiempo real de una transacción interactiva simple muy por
      // encima del default de Prisma (5000ms). Damos más margen aquí.
      timeout: 10000,
      maxWait: 10000,
    });

    this.logger.debug(`Mensaje ${role} agregado a conversación ${conversationId}`);

    return message;
  }

  /**
   * Cuenta conversaciones totales según filtros (para paginación)
   */
  async count(params: {
    isHumanInTheLoop?: boolean;
    status?: string;
    organizationId: string;
    workflowId?: string;
    userId?: string;
  }) {
    const { isHumanInTheLoop, status, organizationId, workflowId, userId } = params;

    return this.prisma.conversation.count({
      where: {
        isHumanInTheLoop,
        ...(status && { status: status.toUpperCase() as any }),
        organizationId,
        workflowId,
        userId,
        isInternalWorkflow: false,
      },
    });
  }

  /**
   * Elimina una conversación (Soft Delete)
   */
  async remove(organizationId: string, id: string) {
    // 1. Verificar ownership
    await this.findOne(organizationId, id);

    return this.prisma.conversation.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Obtiene estadísticas de conversaciones para una organización
   */
  async getStats(organizationId: string): Promise<ConversationStatsDto> {
    const now = new Date();

    // Get organization's ACTIVE subscription to use their billing period
    // Fallback to calendar month for FREE plan or canceled subscriptions
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        organizationId,
        status: 'ACTIVE', // Only use active subscriptions
      },
      select: { currentPeriodStart: true },
    });

    const startOfPeriod =
      subscription?.currentPeriodStart ?? new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalConversations, activeConversations, totalMessagesMonth] = await Promise.all([
      this.prisma.conversation.count({
        where: { organizationId, deletedAt: null, isInternalWorkflow: false },
      }),
      this.prisma.conversation.count({
        where: {
          organizationId,
          status: ConversationStatus.ACTIVE,
          deletedAt: null,
          isInternalWorkflow: false,
        },
      }),
      this.prisma.message.count({
        where: {
          conversation: {
            organizationId,
            isInternalWorkflow: false,
          },
          createdAt: {
            gte: startOfPeriod,
          },
        },
      }),
    ]);

    return {
      totalConversations,
      activeConversations,
      totalMessagesMonth,
    };
  }

  /**
   * Intenta adquirir lock de compactación para una conversación.
   * Si el lock vigente está stale (por TTL), se recupera automáticamente.
   */
  async tryAcquireCompactionLock(
    conversationId: string,
    lockTtlMs: number = this.defaultCompactionLockTtlMs,
  ): Promise<boolean> {
    const staleBefore = new Date(Date.now() - lockTtlMs);
    const now = new Date();

    const result = await this.prisma.conversation.updateMany({
      where: {
        id: conversationId,
        OR: [
          { isCompacting: false },
          { compactingLockedAt: null },
          { compactingLockedAt: { lt: staleBefore } },
        ],
      },
      data: {
        isCompacting: true,
        compactingLockedAt: now,
      },
    });

    return result.count === 1;
  }

  /** Libera lock de compactación. */
  async releaseCompactionLock(conversationId: string): Promise<void> {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        isCompacting: false,
        compactingLockedAt: null,
      },
    });
  }

  /**
   * Crea una compactación y actualiza currentCompactionId en Conversation
   * dentro de una transacción atómica.
   */
  async createAndActivateCompaction(input: CreateCompactionInput) {
    return this.prisma.$transaction(async (tx) => {
      const latest = await tx.conversationCompaction.findFirst({
        where: { conversationId: input.conversationId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });

      const nextVersion = (latest?.version ?? 0) + 1;

      const compaction = await tx.conversationCompaction.create({
        data: {
          conversationId: input.conversationId,
          version: nextVersion,
          summary: input.summary,
          sourceMessageFromId: input.sourceMessageFromId,
          sourceMessageToId: input.sourceMessageToId,
          tokensBefore: input.tokensBefore,
          tokensAfter: input.tokensAfter,
          compressionRatio: input.compressionRatio,
          modelUsed: input.modelUsed,
          status: input.status,
          error: input.error,
        },
      });

      await tx.conversation.update({
        where: { id: input.conversationId },
        data: {
          currentCompactionId: compaction.id,
        },
      });

      return compaction;
    });
  }

  /**
   * Devuelve la compactación activa: el resumen y hasta dónde llegó.
   *
   * `sourceMessageToId` es lo que permite compactar de forma incremental — resumir solo
   * lo que llegó después — en vez de rehacer el resumen entero en cada turno.
   */
  async getActiveCompaction(
    conversationId: string,
  ): Promise<{ summary: string; sourceMessageToId: string | null } | null> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        currentCompaction: {
          select: {
            summary: true,
            status: true,
            sourceMessageToId: true,
          },
        },
      },
    });

    const compaction = conversation?.currentCompaction;

    if (
      compaction?.status !== CompactionStatus.SUCCEEDED ||
      !compaction.summary
    ) {
      return null;
    }

    return {
      summary: compaction.summary,
      sourceMessageToId: compaction.sourceMessageToId,
    };
  }

  /**
   * Devuelve el resumen activo (si existe) para componer contexto de ejecución.
   */
  async getActiveCompactionSummary(conversationId: string): Promise<string | null> {
    const active = await this.getActiveCompaction(conversationId);
    return active?.summary ?? null;
  }
}
