import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { DashboardConversationDto } from './dto/dashboard-conversation.dto';

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
        channel,
        userId,
        endUserId,
        status: 'active',
        messageCount: 0,
        totalTokens: 0,
        totalCost: 0,
      },
    });

    this.logger.log(`Nueva conversación creada: ${newConversation.id}`);
    return newConversation;
  }

  /**
   * Obtiene una conversación por ID con todos sus detalles (incluyendo mensajes)
   *
   * @param id - ID de la conversación
   */
  async findOne(id: string) {
    return this.prisma.conversation.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  /**
   * Actualiza una conversación (Método unificado)
   *
   * @param id - ID de la conversación
   * @param data - Datos a actualizar (compatible con PrismaUpdateInput)
   */
  async update(id: string, data: any) {
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
    skip?: number;
    take?: number;
    isHumanInTheLoop?: boolean;
    status?: string;
    organizationId: string;
  }) {
    const { skip, take, isHumanInTheLoop, status, organizationId } = params;

    return this.prisma.conversation.findMany({
      skip,
      take,
      where: {
        isHumanInTheLoop,
        status,
        organizationId,
      },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
        user: { select: { name: true, email: true, avatar: true } },
        endUser: { select: { name: true, email: true, avatar: true } },
      },
    });
  }

  /**
   * Obtiene el historial de mensajes de una conversación
   *
   * @param conversationId - ID de la conversación
   * @returns Array de mensajes ordenados cronológicamente
   */
  async getMessageHistory(conversationId: string) {
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: {
        role: true,
        content: true,
      },
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
    role: 'human' | 'assistant' | 'system',
    content: string,
  ) {
    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId,
          role,
          content,
        },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: new Date(),
          lastMessageRole: role === 'human' ? 'user' : role, // Normalize 'human' to 'user' if needed by schema enum, or keep string
          // messageCount increment removed to avoid double counting with batchUpdate
        },
      }),
    ]);

    this.logger.debug(`Mensaje ${role} agregado a conversación ${conversationId}`);

    return message;
  }

  /**
   * Cuenta conversaciones totales según filtros (para paginación)
   */
  async count(params: { isHumanInTheLoop?: boolean; status?: string; organizationId: string }) {
    const { isHumanInTheLoop, status, organizationId } = params;

    return this.prisma.conversation.count({
      where: {
        isHumanInTheLoop,
        status,
        organizationId,
      },
    });
  }
}
