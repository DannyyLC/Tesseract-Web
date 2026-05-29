export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  defaultMaxMessages?: number;
  defaultInactivityHours?: number;
  defaultMaxCostPerConv?: number;
  allowOverages: boolean;
  overageLimit?: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  shardKey?: string;
  region?: string;
  metadata?: any;
  stripeCustomerId?: string;
}

export interface Subscription {
  id: string;
  organizationId: string;
  plan: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  customMonthlyPrice?: number;
  customMonthlyCredits?: number;
  customMaxWorkflows?: number;
  customOverageLimit?: number;
  customFeatures?: any;
  createdAt: Date;
  updatedAt: Date;
  canceledAt?: Date;
}
export interface DashboardOrganizationDto {
  id: string;
  name: string;
  plan: string;
  allowOverages: boolean;
  overageLimit: number | null;
  isActive: boolean;
  createdAt: Date;
  customMaxUsers: number | null;
  customMaxApiKeys: number | null;
  customMaxWorkflows: number | null;
  subscriptionData?: DashboardSubscriptionDto | null;
}

export interface UpdateOrganizationDto {
  name?: string;
}

export interface InviteUserDto {
  email: string;
}

export interface AcceptInvitationDto {
  user: string;
  password?: string;
  verificationCode: string;
}

export interface DashboardSubscriptionDto {
  plan: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  customMonthlyPrice: number | null;
  customMonthlyCredits?: number | null;
  customMaxWorkflows?: number | null;
  customFeatures?: any | null;
}

export interface DeleteOrganizationDto {
  confirmationText: string;
  code2FA?: string;
}
