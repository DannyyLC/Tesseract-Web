import { Injectable, Logger, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  DashboardConversationDto,
  ConversationsStatsDto as ConversationStatsDto,
} from '@tesseract/types';
import { CursorPaginatedResponseUtils } from '../common/responses/cursor-paginated-response';
import { PaginatedResponse } from '@tesseract/types';
import {
  ConversationChannel,
  ConversationStatus,
  ChatRole,
  Conversation,
  CompactionStatus,
} from '@tesseract/database';

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

  constructor(private readonly prisma: PrismaService) {}

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
        channel: channel as ConversationChannel,
        userId,
        endUserId,
        status: ConversationStatus.ACTIVE,
        messageCount: 0,
        totalTokens: 0,
        totalCost: 0,
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

    // Buscar si ya existe una conversación para este número de WhatsApp y configuración
    const existing = await this.prisma.conversation.findFirst({
      where: {
        channel: ConversationChannel.WHATSAPP,
        whatsappConfigId: whatsappConfig.id,
        phoneNumberSender: userNumber,
        status: ConversationStatus.ACTIVE,
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

    // Si no existe, crear una nueva conversación para este número de WhatsApp
    const newConversation = await this.prisma.conversation.create({
      data: {
        workflowId,
        organizationId: workflow.organizationId, // Asignación obligatoria
        channel: ConversationChannel.WHATSAPP,
        whatsappConfigId: whatsappConfig.id,
        phoneNumberSender: userNumber,
        status: ConversationStatus.ACTIVE,
        messageCount: 0,
        totalTokens: 0,
        totalCost: 0,
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
      },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation with ID ${id} not found`);
    }

    return conversation;
  }

  /**
   * Actualiza una conversación (Método unificado)
   *
   * @param id - ID de la conversación
   * @param data - Datos a actualizar (compatible con PrismaUpdateInput)
   */
  async update(organizationId: string, id: string, data: any) {
    // 1. Verificar ownership
    await this.findOne(organizationId, id);

    // RESTRICCIÓN HITL: Si es usuario interno (userId != null), no puede modificar isHumanInTheLoop
    if (data.isHumanInTheLoop !== undefined) {
      const existing = await this.prisma.conversation.findUnique({
        where: { id },
        select: { userId: true },
      });

      if (existing?.userId) {
        // Es una conversación interna (User), no debería tener HITL activado manualmente
        throw new ForbiddenException('Internal users cannot toggle Human in the Loop');
      }
    }

    const conversation = await this.prisma.conversation.update({
      where: { id },
      data,
    });

    this.logger.debug(`Conversación ${id} actualizada: ${JSON.stringify(data)}`);
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
      status,
      prioritizeHitl = true,
      organizationId,
      workflowId,
      userId,
    } = params;

    const orderBy = prioritizeHitl
      ? [
          { isHumanInTheLoop: 'desc' as const },
          { status: 'asc' as const },
          { lastMessageAt: 'desc' as const },
          { createdAt: 'desc' as const },
        ]
      : [{ createdAt: 'desc' as const }];

    const conversations = await this.prisma.conversation.findMany({
      take:
        paginationAction === 'next' || paginationAction === null
          ? (take ?? 10) + 1
          : -((take ?? 10) + 1),
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      where: {
        isHumanInTheLoop,
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
        endUser: { select: { name: true, email: true, avatar: true } },
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
            attachment.processingStatus === 'PROCESSED' && Boolean(attachment.processedText?.trim()),
        )
        .map((attachment) => `[${attachment.type.toLowerCase()}] ${attachment.processedText!.trim()}`);

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
            attachment.processingStatus === 'PROCESSED' && Boolean(attachment.processedText?.trim()),
        )
        .map((attachment) => `[${attachment.type.toLowerCase()}] ${attachment.processedText!.trim()}`);

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
        select: { organizationId: true },
      });

      if (!conversation) {
        throw new NotFoundException(`Conversation with ID ${conversationId} not found`);
      }

      const createdMessage = await tx.message.create({
        data: {
          conversationId,
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

      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: new Date(),
          lastMessageRole: role === ChatRole.USER ? ChatRole.USER : role, // Normalize 'human' to 'user' if needed by schema enum, or keep string
          // messageCount increment removed to avoid double counting with batchUpdate
        },
      });

      return createdMessage;
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
   * Devuelve el resumen activo (si existe) para componer contexto de ejecución.
   */
  async getActiveCompactionSummary(conversationId: string): Promise<string | null> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        currentCompaction: {
          select: {
            summary: true,
            status: true,
          },
        },
      },
    });

    if (!conversation?.currentCompaction) {
      return null;
    }

    return conversation.currentCompaction.status === CompactionStatus.SUCCEEDED
      ? conversation.currentCompaction.summary
      : null;
  }

}