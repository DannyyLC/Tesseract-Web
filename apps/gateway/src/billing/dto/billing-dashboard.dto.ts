import { SubscriptionPlan } from '@prisma/client';

export class BillingDashboardDto {
  plan: SubscriptionPlan;
  status: string;
  nextBillingDate: Date | null;
  cancelAtPeriodEnd: boolean;
  pendingPlanChange: string | null;
  allowOverages: boolean;
  overageLimit: number;
  hasBillingAccount: boolean;

  credits: {
    available: number;
    usedThisMonth: number;
    limit: number;
  };

  usage: {
    workflows: {
      used: number;
      limit: number;
    };
    apiKeys: {
      used: number;
      limit: number;
    };
    users: {
      used: number;
      limit: number;
    };
  };
}
