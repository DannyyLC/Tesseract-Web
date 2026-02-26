export interface DashboardExecutionDataDto {
  id: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  duration: number | null;
  trigger: string;
  credits: number | null;
  workflowId: string;
  // workflowName can be present if backend flattens it, but user JSON shows nested
  workflow?: { name: string };
  workflowName?: string | null;
  userId: string | null;
  user?: { name: string };
  userName?: string | null;
}

export interface ExecutionsStatsDto {
  period: string;
  total: number;
  successful: number;
  failed: number;
  cancelled: number;
  timeout: number;
  successRate: number;
  avgDuration: number;
  totalDuration: number;
  byStatus: Record<string, number>;
  byTrigger: Record<string, number>;
  topWorkflows: {
    workflowId: string;
    workflowName: string;
    executions: number;
    successRate: number;
  }[];
  credits: {
    totalConsumed: number;
    avgPerExecution: number;
    executionsInOverage: number;
    overageRate: number;
    byCategory: Record<string, { count: number; credits: number }>;
  };
  dailyStats?: {
    date: string;
    count: number;
 }[];
}

export interface ExecutionDto {
  id: string;
  startedAt: Date;
  finishedAt: Date | null;
  duration: number | null;
  trigger: string;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
  credits: number | null;
  balanceBefore: number | null;
  balanceAfter: number | null;
  wasOverage: boolean | null;
  workflowId: string;
  organizationId: string;
  conversationId: string | null;
  userId: string | null;
  apiKeyName?: string;
}
