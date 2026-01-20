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

    // Si no existe o no viene conversationId, crear una nueva
    const newConversation = await this.prisma.conversation.create({
      data: {
        workflowId,
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
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        role,
        content,
      },
    });

    this.logger.debug(`Mensaje ${role} agregado a conversación ${conversationId}`);

    return message;
  }

  /**
   * Incrementa el contador de mensajes y actualiza timestamp
   *
   * @param conversationId - ID de la conversación
   */
  async incrementMessageCount(conversationId: string) {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        messageCount: { increment: 1 },
        lastMessageAt: new Date(),
      },
    });
  }

  /**
   * Actualiza las estadísticas de uso (tokens y costo) de la conversación
   *
   * @param conversationId - ID de la conversación
   * @param tokens - Tokens consumidos
   * @param cost - Costo en USD
   */
  async updateUsageStats(conversationId: string, tokens: number, cost: number) {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        totalTokens: { increment: tokens },
        totalCost: { increment: cost },
      },
    });

    this.logger.debug(
      `Estadísticas actualizadas para conversación ${conversationId}: +${tokens} tokens, +$${cost}`,
    );
  }

  /**
   * Actualiza mensajes y estadísticas en una sola operación (batch update)
   * Optimizado para reducir queries a la BD
   *
   * @param conversationId - ID de la conversación
   * @param messageIncrement - Cuántos mensajes agregar al contador
   * @param tokens - Tokens consumidos (opcional)
   * @param cost - Costo en USD (opcional)
   */
  async batchUpdate(
    conversationId: string,
    messageIncrement: number,
    tokens?: number,
    cost?: number,
  ) {
    const updateData: any = {
      messageCount: { increment: messageIncrement },
      lastMessageAt: new Date(),
    };

    if (tokens !== undefined && tokens > 0) {
      updateData.totalTokens = { increment: tokens };
    }

    if (cost !== undefined && cost > 0) {
      updateData.totalCost = { increment: cost };
    }

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: updateData,
    });

    this.logger.debug(
      `Batch update para conversación ${conversationId}: ` +
        `+${messageIncrement} mensajes, +${tokens ?? 0} tokens, +$${cost ?? 0}`,
    );
  }

  async getDashboardData(
    idOrganization: string,
    initPage: number,
    pageSize: number,
  ):Promise<{ conversations: DashboardConversationDto[]; totalPages: number }> {

    const totalCount = await this.prisma.conversation.count({
    where: {
      workflow: {
        organizationId: idOrganization,
      },
    },
  });
    
    const conversations = await this.prisma.conversation.findMany({
      where: {
        workflow: {
          organizationId: idOrganization,
        }
      },
      select: {
          title: true,
          channel: true,
          status: true,
          messageCount: true,
          totalTokens: true,
          totalCost: true,
          lastMessageAt: true,
          createdAt: true,
          closedAt: true,
          workflowId: true,
          userId: true,
          endUserId: true,
        },
        take: pageSize,
        skip: initPage > 0 ? (initPage - 1) * pageSize : 0,
        orderBy: {
          createdAt: 'desc',
        }
    });
     const totalPages = Math.ceil(totalCount / pageSize);

    return { conversations, totalPages };
  }
}
