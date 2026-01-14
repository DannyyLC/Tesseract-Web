import { SubscriptionPlan, SubscriptionStatus } from '@workflow-platform/database';

export interface DashboardSubscriptionDto {
  id: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  pendingPlanChange: SubscriptionPlan | null;
  planChangeRequestedAt: Date | null;
  customMonthlyPrice?: number | null;
  customMonthlyCredits?: number | null;
  customMaxWorkflows?: number | null;
  customFeatures?: any | null;
}
