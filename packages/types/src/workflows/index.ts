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
  lastExecutedAt?: Date | null;
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

/**
 * Workflow configuration shape — used by the frontend workflow builder
 */
export interface WorkflowConfig {
  type: 'agent';
  graph: {
    type: 'react' | 'supervisor' | 'router' | 'sequential' | 'parallel';
    config?: Record<string, any>;
  };
  agents: Record<
    string,
    {
      model: string;
      temperature?: number;
      system_prompt?: string;
      tools?: (string | { id: string; functions?: string[] })[];
    }
  >;
}

export interface ExecuteWorkflowDto {
  input: Record<string, any>;
  metadata?: Record<string, any>;
}
