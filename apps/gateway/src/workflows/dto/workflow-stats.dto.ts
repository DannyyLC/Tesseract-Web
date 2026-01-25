export class WorkflowStatsDto {
    totalWorkflows: number;
    activeWorkflows: number;
    totalExecutionsMonth: number;
    creditsConsumedMonth: number;
    byCategory: Record<string, number>;
}
