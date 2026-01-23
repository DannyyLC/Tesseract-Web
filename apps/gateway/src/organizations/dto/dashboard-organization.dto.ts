import { SubscriptionPlan } from '@workflow-platform/database';
import { DashboardSubscriptionDto } from './dashboard-subscription.dto';

export interface DashboardOrganizationDto {
  id: string;
  name: string;
  plan: SubscriptionPlan;
  allowOverages: boolean;
  overageLimit: number | null;
  isActive: boolean;
  createdAt: Date;
  customMaxUsers: number | null;
  customMaxApiKeys: number | null;
  customMaxWorkflows: number | null;
  subscriptionData?: DashboardSubscriptionDto | null;
}
