import { PaginatedResponse } from '../api/api_response';
import { WorkflowCategory } from '../billing/plans';


export interface DashboardExecutionDto {
  status: string;
  startedAt: string;
  finishedAt: string | null;
  duration: number | null;
  trigger: string;
  credits: number | null;
  balanceBefore: number | null;
  balanceAfter: number | null;
  wasOverage: boolean;
  error: string | null;
  retryCount: number;
  workflowId: string;
  userId: string | null;
  conversationId: string | null;
}

export interface DashboardWorkflowDto {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  category: WorkflowCategory;
  lastExecutedAt?: string | null;
}

export type WorkflowsResponse = PaginatedResponse<DashboardWorkflowDto>;

export interface WorkflowStatsDto {
  totalWorkflows: number;
  activeWorkflows: number;
  totalExecutionsMonth: number;
  creditsConsumedMonth: number;
  byCategory: Record<WorkflowCategory, number>;
}

export interface WorkflowMetricsDto {
  workflowId: string;
  totalExecutions: number;
  successRate: number;
  avgDuration: number;
  granularity: 'hour' | 'day' | 'week' | 'month';
  executionHistoryChart: {
    date: string;
    count: number;
    success: number;
    failed: number;
  }[];
  errorDistribution: Record<string, number>;
}
