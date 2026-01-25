export class WorkflowMetricsDto {
    workflowId: string;
    totalExecutions: number;
    successRate: number;
    avgDuration: number;
    executionHistoryChart: {
        date: string;
        count: number;
        success: number;
        failed: number;
    }[];
    errorDistribution: Record<string, number>;
}
