export class DashboardMessageDto {
    role: string;
    content: string;
    attachments: Object | null;
    model: string | null;
    tokens: number | null;
    cost: number | null;
    latencyMs: number | null;
    toolCalls: Object | null;
    toolResults: Object | null;
    feedback: string | null;
    feedbackComment: string | null;
    createdAt: Date;
}