export class DashboardExecutionDto {
  id: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  duration: number | null;
  trigger: string;
  credits: number | null;
  workflowId: string;
  workflowName?: string | null;
  userId: string | null;
  userName?: string | null;
}
