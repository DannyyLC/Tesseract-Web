import { ConversationMessageDto } from './conversation-message.dto';

export class ConversationDetailDto {
    id: string;
    title: string | null;
    channel: string;
    status: string;
    isHumanInTheLoop: boolean;
    messageCount: number;
    lastMessageAt: Date | null;
    createdAt: Date;
    closedAt: Date | null;
    workflowId: string;
    userId: string | null;
    endUserId: string | null;
    messages: ConversationMessageDto[];
}
