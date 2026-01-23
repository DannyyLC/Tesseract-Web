export class DashboardExecutionDto {
    status: string;
    startedAt: Date;
    finishedAt: Date | null;
    duration: number | null;
    trigger: string;
    credits: number | null;
    error: string | null;
    retryCount: number;
    workflowId: string;
    workflowName?: string | null;
    userId: string | null;
    userName?: string | null;
    conversationId: string | null
}
