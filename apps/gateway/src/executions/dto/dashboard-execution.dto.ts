import { Conversation, User } from "@workflow-platform/database";

export class DashboardExecutionDto { 
    status: string;
    startedAt: Date;
    finishedAt: Date | null;
    duration: number | null;
    trigger: string;
    credits: number | null;
    cost: number | null;
    tokensUsed: number | null;
    balanceBefore: number | null;
    balanceAfter: number | null;
    wasOverage: boolean;
    error: string | null;
    retryCount: number;
    workflowId: string;
    userId: string | null;
    conversationId: string | null
}