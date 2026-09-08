export * from './plans';
export * from './lookup-keys';
import { SubscriptionPlan } from './plans';

export interface BillingDashboardData {
  plan: SubscriptionPlan;
  status: string; // 'ACTIVE', 'CANCELED', 'PAST_DUE', 'NO_SUBSCRIPTION'
  nextBillingDate: string | Date | null;
  cancelAtPeriodEnd: boolean;
  pendingPlanChange: string | null;
  allowOverages: boolean;
  overageLimit: number;
  hasBillingAccount: boolean;
  /** País de facturación (ISO 3166-1 alpha-2). NULL mientras no haya pasado por el checkout. */
  country: string | null;
  /** Si el SAT aceptó los datos fiscales. Solo aplica cuando `country` es 'MX'. */
  fiscalProfileComplete: boolean;

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
    datasets: {
      used: number;
      limit: number;
    };
    datasetRows: {
      used: number;
      limit: number;
    };
  };
}

export interface UpdateSubscriptionDto {
  plan: SubscriptionPlan;
}
export interface ToggleOveragesDto {
  allowOverages: boolean;
  overageLimit?: number;
}

export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  CANCELED = 'CANCELED',
  PAST_DUE = 'PAST_DUE',
  INCOMPLETE = 'INCOMPLETE',
}

export interface SubscriptionDetails {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  currentPeriodStart: string | Date | null;
  currentPeriodEnd: string | Date | null;
  cancelAtPeriodEnd: boolean;

  pendingPlanChange?: boolean;
  planChangeRequestedAt?: string | Date | null;

  customMonthlyPrice?: number;
  customMonthlyCredits?: number;
  customMaxWorkflows?: number;
  customFeatures?: any;

  id?: string;
  organizationId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  customOverageLimit?: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  canceledAt?: string | Date | null;
}

export interface CheckoutResponse {
  url: string;
}
export interface PortalResponse {
  url: string;
}
