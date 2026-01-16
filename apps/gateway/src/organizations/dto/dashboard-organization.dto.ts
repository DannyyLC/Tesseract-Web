import { SubscriptionPlan } from '@workflow-platform/database';
import { DashboardSubscriptionDto } from './dashboard-subscription.dto';

export interface DashboardOrganizationDto {
  name: string;
  plan: SubscriptionPlan;
  allowOverages: boolean;
  isActive: boolean;
  createdAt: Date;
  customMaxUsers: number | null;
  customMaxApiKeys: number | null;
  customMaxWorkflows: number | null;
  subscriptionData: DashboardSubscriptionDto | null;
}
