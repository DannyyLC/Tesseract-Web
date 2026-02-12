import { SubscriptionPlan } from '@workflow-platform/database';
import { DashboardSubscriptionDto } from './dashboard-subscription.dto';
import { ApiProperty } from '@nestjs/swagger';

export class DashboardOrganizationDto {
  @ApiProperty({ description: 'Unique identifier for the organization.' })
  id: string;

  @ApiProperty({ description: 'Name of the organization.' })
  name: string;

  @ApiProperty({ description: 'The subscription plan assigned to the organization.' })
  plan: SubscriptionPlan;

  @ApiProperty({ description: 'Whether the organization is allowed to exceed its usage limits.' })
  allowOverages: boolean;

  @ApiProperty({ description: 'Maximum allowed overage limit in credits, or null if not set.' })
  overageLimit: number | null;

  @ApiProperty({ description: 'Whether the organization is currently active.' })
  isActive: boolean;

  @ApiProperty({ description: 'Date the organization was created.' })
  createdAt: Date;

  @ApiProperty({ description: 'Custom maximum number of users allowed, or null if not set.' })
  customMaxUsers: number | null;

  @ApiProperty({ description: 'Custom maximum number of API keys allowed, or null if not set.' })
  customMaxApiKeys: number | null;

  @ApiProperty({ description: 'Custom maximum number of workflows allowed, or null if not set.' })
  customMaxWorkflows: number | null;

  @ApiProperty({ description: 'Subscription data for the organization, if available.' })
  subscriptionData?: DashboardSubscriptionDto | null;
}
