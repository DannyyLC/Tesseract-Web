import { Expose, Type } from 'class-transformer';
import { WorkflowCategory } from '@tesseract/types';

export class AdminAnalyticsTopWorkflowDto {
  @Expose()
  workflowId: string;

  @Expose()
  workflowName: string;

  @Expose()
  organizationId: string;

  @Expose()
  organizationName: string;

  @Expose()
  category: WorkflowCategory;

  @Expose()
  executions: number;

  @Expose()
  costUSD: number;

  @Expose()
  creditsCharged: number;
}

export class AdminAnalyticsTopWorkflowsResponseDto {
  @Expose()
  metric: 'cost' | 'executions';

  @Expose()
  @Type(() => AdminAnalyticsTopWorkflowDto)
  items: AdminAnalyticsTopWorkflowDto[];
}
