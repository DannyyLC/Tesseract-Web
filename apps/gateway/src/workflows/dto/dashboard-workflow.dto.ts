import { WorkflowCategory } from "@workflow-automation/shared-types";
import { DashboardExecutionDto } from '../../executions/dto/dashboard-execution.dto';

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
  lastExecutedAt?: Date | null;
  avgExecutionTime?: number | null;
  executions: DashboardExecutionDto[];
}
