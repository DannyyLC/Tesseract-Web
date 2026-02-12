import { SubscriptionPlan, SubscriptionStatus } from '@workflow-platform/database';
import { ApiProperty } from '@nestjs/swagger';

export class DashboardSubscriptionDto {
  @ApiProperty({ description: 'Unique identifier for the subscription.' })
  id: string;

  @ApiProperty({ description: 'The subscription plan type.' })
  plan: SubscriptionPlan;

  @ApiProperty({ description: 'Current status of the subscription.' })
  status: SubscriptionStatus;

  @ApiProperty({ description: 'Start date of the current billing period.' })
  currentPeriodStart: Date;

  @ApiProperty({ description: 'End date of the current billing period.' })
  currentPeriodEnd: Date;

  @ApiProperty({ description: 'Whether the subscription will be cancelled at the end of the current period.' })
  cancelAtPeriodEnd: boolean;

  @ApiProperty({ description: 'Custom monthly price for the subscription, if applicable.' })
  customMonthlyPrice: number | null;

  @ApiProperty({ description: 'Custom monthly credits for the subscription, if applicable.' })
  customMonthlyCredits?: number | null;

  @ApiProperty({ description: 'Custom maximum number of workflows for the subscription, if applicable.' })
  customMaxWorkflows?: number | null;

  @ApiProperty({ description: 'Custom features for the subscription, if applicable.' })
  customFeatures?: any | null;
}
