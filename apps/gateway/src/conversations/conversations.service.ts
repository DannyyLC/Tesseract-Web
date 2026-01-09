import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

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

    constructor(
        private readonly prisma: PrismaService
    ) {}

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
}