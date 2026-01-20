import { PrismaService } from '../database/prisma.service';
import { Injectable } from '@nestjs/common';
import { DashboardMessageDto } from './dto/dashboard-message.dto';

@Injectable()
export class MessagesService {
    constructor(
        private readonly prismaService: PrismaService
    ){}

    async getDashboardData(idConversation: string):
    Promise<DashboardMessageDto[]> {
        const messages = await this.prismaService.message.findMany({
            where: {
                conversationId: idConversation
            },
            select: {
                role: true,
                content: true,
                attachments: true,
                model: true,
                tokens: true,
                cost: true,
                latencyMs: true,
                toolCalls: true,
                toolResults: true,
                feedback: true,
                feedbackComment: true,
                createdAt: true
            },
            orderBy: {
                createdAt: 'desc'
            }
        });
        return messages;
    }
}
