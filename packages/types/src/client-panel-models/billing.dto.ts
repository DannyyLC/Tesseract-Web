export enum SubscriptionPlan {
  STARTER = 'STARTER',
  GROWTH = 'GROWTH',
  BUSINESS = 'BUSINESS',
  PRO = 'PRO',
  FREE = 'FREE',
  ENTERPRISE = 'ENTERPRISE',
}

// Interfaz para la página de Pricing (Lista de planes)
export interface PlanLimits {
  maxUsers: number;
  maxWorkflows: number;
  maxApiKeys: number;
  monthlyCredits: number;
  overageLimit: number;
  allowOverages: boolean;
}

export interface BillingPlan {
  type: SubscriptionPlan;
  name: string;
  description: string;
  price: {
    monthly: number;
    currency: string;
  };
  limits: PlanLimits;
  stripePriceId?: string;
  
  // UI
  features: string[];
  highlightFeature?: string;
  popular?: boolean;
}

// Interfaz para el Dashboard de Facturación (Consumo actual)
export interface BillingDashboardData {
  plan: SubscriptionPlan;
  status: string; // 'ACTIVE', 'CANCELED', 'PAST_DUE', 'NO_SUBSCRIPTION'
  nextBillingDate: string | Date | null;
  cancelAtPeriodEnd: boolean;
  allowOverages: boolean;

  credits: {
    available: number;      // Puede ser negativo si hay overage
    usedThisMonth: number;
    limit: number;          // Límite del plan base
  };

  usage: {
    workflows: {
      used: number;
      limit: number; // del plan o custom
    };
    apiKeys: {
      used: number;
      limit: number; // del plan o custom
    };
    users: {
      used: number;
      limit: number; // del plan o custom
    };
  };
}

// DTO para actualizar suscripción
export interface UpdateSubscriptionDto {
  plan: SubscriptionPlan;
}

// DTO para togglear overages
export interface ToggleOveragesDto {
  allowOverages: boolean;
  overageLimit?: number;
}

// Estados de suscripción (copia de Prisma para frontend)
export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  CANCELED = 'CANCELED',
  PAST_DUE = 'PAST_DUE',
  INCOMPLETE = 'INCOMPLETE',
}

// Detalles de la suscripción
export interface SubscriptionDetails {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  currentPeriodStart: string | Date | null;
  currentPeriodEnd: string | Date | null;
  cancelAtPeriodEnd: boolean;

  // New fields from backend
  pendingPlanChange?: boolean;
  planChangeRequestedAt?: string | Date | null;
  
  // Custom Enterprise
  customMonthlyPrice?: number;
  customMonthlyCredits?: number;
  customMaxWorkflows?: number;
  customFeatures?: any;

  // Optional legacy fields (if still needed elsewhere, otherwise remove)
  id?: string;
  organizationId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  customOverageLimit?: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  canceledAt?: string | Date | null;
}

// Respuestas de API
export interface CheckoutResponse {
  url: string;
}

export interface PortalResponse {
  url: string;
}