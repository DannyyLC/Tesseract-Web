import { DashboardExecutionDto } from '../../executions/dto/dashboard-execution.dto';
import { WorkflowCategory } from '@workflow-automation/shared-types';

export class DashboardWorkflowDto {
  id: string;
  name: string;
  description?: string | null;
  category: WorkflowCategory;
  isActive: boolean;
  isPaused: boolean;
  version: number;
  triggerType: string[];
  schedule?: string | null;
  maxTokensPerExecution: number;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  totalCreditsConsumed: number;
  avgCreditsPerExecution?: number | null;
  lastExecutedAt?: Date | null;
  avgExecutionTime?: number | null;
  executions: DashboardExecutionDto[];
}
