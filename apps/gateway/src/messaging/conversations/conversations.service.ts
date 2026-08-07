import { Injectable, Logger, ForbiddenException, NotFoundException } from '@nestjs/common';
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
  Conversation,
  CompactionStatus,
} from '@tesseract/database';
import { UtilityService } from '@/platform/utility/utility.service';

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
  ) {}

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
   * @returns Conversación existente o nueva
   */
  async findOrCreateConversation(
    workflowId: string,
    channel: string,
    userId?: string,
    endUserId?: string,
    conversationId?: string,
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
      },
    });

    this.logger.log(`Nueva conversación creada: ${newConversation.id}`);
    return newConversation;
  }

  async findOrCreateConversationFromWhatsAppMessage(
    workflowId: string,
    phoneNumber: string,
    userNumber: string,
  ) {
    const whatsappConfig = await this.prisma.whatsAppConfig.findUnique({
      where: { phoneNumber },
    });
    if (!whatsappConfig) {
      throw new Error(`WhatsApp config no encontrada para número: ${phoneNumber}`);
    }

    // Buscar si ya existe una conversación para este número de WhatsApp y configuración.
    //
    // El filtro `deletedAt: null` no es opcional: sin él se reutiliza una conversación
    // borrada desde la UI, y como `findOne` sí descarta las borradas, el flujo del
    // webhook terminaba lanzando NotFoundException y no enviando la respuesta. En la
    // práctica, borrar una conversación dejaba ese número sin servicio para siempre.
    const existing = await this.prisma.conversation.findFirst({
      where: {
        channel: ConversationChannel.WHATSAPP,
        whatsappConfigId: whatsappConfig.id,
        phoneNumberSender: userNumber,
        status: ConversationStatus.ACTIVE,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

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
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            attachments: true,
          },
        },
        endUser: { select: { phoneNumber: true } },
      },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation with ID ${id} not found`);
    }

    return {
      ...conversation,
      endUserPhoneNumber: conversation.endUser?.phoneNumber ?? null,
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
        organizationId,
        workflowId,
        userId,
        deletedAt: null,
      },
      orderBy,
      include: {
        messages: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
        user: { select: { name: true, email: true, avatar: true } },
        endUser: { select: { name: true, email: true, avatar: true, phoneNumber: true } },
      },
    });

    const paginatedResult = await CursorPaginatedResponseUtils.getInstance().build<Conversation>(
      conversations,
      take ?? 10,
      paginationAction,
    );

    return {
      ...paginatedResult,
      items: paginatedResult.items.map((c: any) => ({
        ...c,
        isInternal: !!c.userId,
        endUserPhoneNumber: c.endUser?.phoneNumber ?? null,
      })) as DashboardConversationDto[],
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

      await tx.conversation.update({
        where: { id: conversationId },
        data: {
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
        where: { organizationId, deletedAt: null },
      }),
      this.prisma.conversation.count({
        where: { organizationId, status: ConversationStatus.ACTIVE, deletedAt: null },
      }),
      this.prisma.message.count({
        where: {
          conversation: {
            organizationId,
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
      !compaction ||
      compaction.status !== CompactionStatus.SUCCEEDED ||
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
