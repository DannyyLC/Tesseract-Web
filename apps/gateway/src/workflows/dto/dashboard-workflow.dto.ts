import { WorkflowCategory } from '@tesseract/types';

export class DashboardWorkflowDto {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  category: WorkflowCategory;
  lastExecutedAt: Date | null;
}
