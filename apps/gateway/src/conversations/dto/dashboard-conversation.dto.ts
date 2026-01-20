export class DashboardConversationDto {
    title: string | null;
    channel: string;
    status: string;
    messageCount: number;
    totalTokens: number;
    totalCost: number;
    lastMessageAt: Date | null;
    createdAt: Date;
    closedAt: Date | null;
    workflowId: string;
    userId: string | null;
    endUserId: string | null;
}