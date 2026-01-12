/**
 * Sistema de Planes de Suscripción con Créditos
 *
 * Define los planes disponibles, sus límites, y configuración de créditos.
 * Sistema de pre-pago: créditos mensuales con renovación automática.
 */

// ============================================
// IMPORTS
// ============================================
import { WorkflowCategory, ModelTier } from '@prisma/client';

// ============================================
// ENUMS
// ============================================
/**
 * Planes de suscripción disponibles
 */
export enum SubscriptionPlan {
  FREE = 'FREE', // Plan gratuito (sin pago)
  STARTER = 'STARTER',
  GROWTH = 'GROWTH',
  BUSINESS = 'BUSINESS',
  PRO = 'PRO',
  ENTERPRISE = 'ENTERPRISE',
}

// Re-exportar enums de Prisma para facilitar el uso
export { WorkflowCategory, ModelTier };

// ============================================
// INTERFACES
// ============================================
/**
 * Configuración de créditos por categoría de workflow
 */
export interface WorkflowCategoryConfig {
  category: WorkflowCategory;
  credits: number; // Créditos que cuesta ejecutar
  maxTokens: number; // Límite de tokens por ejecución
  allowedModelTiers: ModelTier[]; // Tiers de modelos permitidos
  description: string;
}

/**
 * Límites de un plan de suscripción
 */
export interface PlanLimits {
  maxUsers: number; // Usuarios permitidos en la organización
  maxWorkflows: number; // Workflows activos simultáneos
  maxApiKeys: number; // API keys permitidas
  monthlyCredits: number; // Créditos incluidos por mes
  overageLimit: number; // Límite de créditos en negativo (overage)
  allowOverages: boolean; // Si permite balance negativo
}

/**
 * Información completa de un plan
 */
export interface Plan {
  type: SubscriptionPlan;
  name: string;
  description: string;
  price: {
    monthly: number; // USD por mes
    currency: string;
  };
  limits: PlanLimits;
  popular?: boolean; // Badge "Más popular"
  stripePriceId?: string; // Stripe Price ID (opcional hasta integrar)
}

/**
 * Configuración personalizada para ENTERPRISE
 */
export interface EnterprisePlanConfig {
  customMonthlyPrice?: number;
  customMonthlyCredits?: number;
  customMaxWorkflows?: number;
  customOverageLimit?: number;
  customFeatures?: Record<string, any>;
}

// ============================================
// CONFIGURACIÓN DE CATEGORÍAS DE WORKFLOWS
// ============================================
/**
 * Configuración de costos y límites por categoría de workflow
 */
export const WORKFLOW_CATEGORIES: Record<WorkflowCategory, WorkflowCategoryConfig> = {
  [WorkflowCategory.LIGHT]: {
    category: WorkflowCategory.LIGHT,
    credits: 1,
    maxTokens: 20_000,
    allowedModelTiers: [ModelTier.BASIC, ModelTier.STANDARD, ModelTier.PREMIUM],
    description: 'Tareas simples y rápidas con respuestas directas',
  },
  [WorkflowCategory.STANDARD]: {
    category: WorkflowCategory.STANDARD,
    credits: 5,
    maxTokens: 50_000,
    allowedModelTiers: [ModelTier.BASIC, ModelTier.STANDARD, ModelTier.PREMIUM],
    description: 'Workflows completos con múltiples pasos y herramientas',
  },
  [WorkflowCategory.ADVANCED]: {
    category: WorkflowCategory.ADVANCED,
    credits: 25,
    maxTokens: 128_000,
    allowedModelTiers: [ModelTier.BASIC, ModelTier.STANDARD, ModelTier.PREMIUM],
    description: 'Agentes complejos multi-step con reasoning avanzado',
  },
};

// ============================================
// CONFIGURACIÓN DE PLANES
// ============================================
/**
 * Precio por crédito en overage
 */
export const OVERAGE_PRICE_PER_CREDIT = 0.01; // $0.01 USD por crédito

/**
 * Configuración completa de todos los planes
 */
export const PLANS: Record<SubscriptionPlan, Plan> = {
  [SubscriptionPlan.FREE]: {
    type: SubscriptionPlan.FREE,
    name: 'Free',
    description: 'Plan gratuito con límites básicos',
    price: {
      monthly: 0,
      currency: 'USD',
    },
    limits: {
      maxUsers: 1,
      maxWorkflows: 0,
      maxApiKeys: 0,
      monthlyCredits: 0,
      overageLimit: 0,
      allowOverages: false,
    },
  },

  [SubscriptionPlan.STARTER]: {
    type: SubscriptionPlan.STARTER,
    name: 'Starter',
    description: 'Perfecto para empezar a automatizar tareas',
    price: {
      monthly: 25,
      currency: 'USD',
    },
    limits: {
      maxUsers: 10,
      maxWorkflows: 3,
      maxApiKeys: 50,
      monthlyCredits: 150,
      overageLimit: 150, // 1 mes extra de créditos
      allowOverages: true,
    },
  },

  [SubscriptionPlan.GROWTH]: {
    type: SubscriptionPlan.GROWTH,
    name: 'Growth',
    description: 'Para equipos que escalan sus operaciones',
    price: {
      monthly: 79,
      currency: 'USD',
    },
    limits: {
      maxUsers: 25,
      maxWorkflows: 7,
      maxApiKeys: 100,
      monthlyCredits: 500,
      overageLimit: 500,
      allowOverages: true,
    },
    popular: true,
  },

  [SubscriptionPlan.BUSINESS]: {
    type: SubscriptionPlan.BUSINESS,
    name: 'Business',
    description: 'Para empresas con alta demanda',
    price: {
      monthly: 199,
      currency: 'USD',
    },
    limits: {
      maxUsers: 50,
      maxWorkflows: 12,
      maxApiKeys: 250,
      monthlyCredits: 1500,
      overageLimit: 1500,
      allowOverages: true,
    },
  },

  [SubscriptionPlan.PRO]: {
    type: SubscriptionPlan.PRO,
    name: 'Pro',
    description: 'Para organizaciones que necesitan máxima capacidad',
    price: {
      monthly: 499,
      currency: 'USD',
    },
    limits: {
      maxUsers: 100,
      maxWorkflows: 25,
      maxApiKeys: 500,
      monthlyCredits: 5000,
      overageLimit: 5000,
      allowOverages: true,
    },
  },

  [SubscriptionPlan.ENTERPRISE]: {
    type: SubscriptionPlan.ENTERPRISE,
    name: 'Enterprise',
    description: 'Solución personalizada para grandes organizaciones',
    price: {
      monthly: 0, // Custom pricing
      currency: 'USD',
    },
    limits: {
      maxUsers: -1, // Ilimitado (se configura custom)
      maxWorkflows: -1, // Ilimitado (se configura custom)
      maxApiKeys: -1, // Ilimitado (se configura custom)
      monthlyCredits: -1, // Ilimitado (se configura custom)
      overageLimit: -1, // Ilimitado (se configura custom)
      allowOverages: true,
    },
  },
};

// ============================================
// HELPERS
// ============================================

/**
 * Obtiene la configuración de un plan
 */
export function getPlan(planType: SubscriptionPlan): Plan {
  return PLANS[planType];
}

/**
 * Obtiene los límites de un plan (con soporte para ENTERPRISE custom)
 */
export function getPlanLimits(
  planType: SubscriptionPlan,
  enterpriseConfig?: EnterprisePlanConfig,
): PlanLimits {
  const plan = PLANS[planType];

  // Para ENTERPRISE, usar valores custom si existen
  if (planType === SubscriptionPlan.ENTERPRISE && enterpriseConfig) {
    return {
      maxUsers: plan.limits.maxUsers,
      maxWorkflows: enterpriseConfig.customMaxWorkflows ?? plan.limits.maxWorkflows,
      maxApiKeys: plan.limits.maxApiKeys,
      monthlyCredits: enterpriseConfig.customMonthlyCredits ?? plan.limits.monthlyCredits,
      overageLimit: enterpriseConfig.customOverageLimit ?? plan.limits.overageLimit,
      allowOverages: plan.limits.allowOverages,
    };
  }

  return plan.limits;
}

/**
 * Verifica si un plan puede crear más workflows
 */
export function canCreateWorkflow(
  planType: SubscriptionPlan,
  currentWorkflows: number,
  enterpriseConfig?: EnterprisePlanConfig,
): boolean {
  const limits = getPlanLimits(planType, enterpriseConfig);

  // -1 = ilimitado
  if (limits.maxWorkflows === -1) {
    return true;
  }

  return currentWorkflows < limits.maxWorkflows;
}

/**
 * Verifica si hay suficientes créditos para ejecutar un workflow
 */
export function hasSufficientCredits(
  currentBalance: number,
  workflowCategory: WorkflowCategory,
  allowOverages: boolean,
  overageLimit: number,
): boolean {
  const requiredCredits = WORKFLOW_CATEGORIES[workflowCategory].credits;

  // Si tiene balance positivo suficiente
  if (currentBalance >= requiredCredits) {
    return true;
  }

  // Si no permite overages
  if (!allowOverages) {
    return false;
  }

  // Verificar límite de overage
  const balanceAfterExecution = currentBalance - requiredCredits;
  return Math.abs(balanceAfterExecution) <= overageLimit;
}

/**
 * Obtiene el costo en créditos de un workflow según su categoría
 */
export function getWorkflowCreditCost(category: WorkflowCategory): number {
  return WORKFLOW_CATEGORIES[category].credits;
}

/**
 * Obtiene el límite de tokens de un workflow según su categoría
 */
export function getWorkflowMaxTokens(category: WorkflowCategory): number {
  return WORKFLOW_CATEGORIES[category].maxTokens;
}

/**
 * Verifica si un modelo puede usarse en un workflow de cierta categoría
 */
export function canUseModelInWorkflow(
  modelTier: ModelTier,
  workflowCategory: WorkflowCategory,
): boolean {
  return WORKFLOW_CATEGORIES[workflowCategory].allowedModelTiers.includes(modelTier);
}

/**
 * Calcula el costo de overage en USD
 */
export function calculateOverageCost(overageCredits: number): number {
  return Math.abs(overageCredits) * OVERAGE_PRICE_PER_CREDIT;
}

/**
 * Obtiene todos los planes ordenados por precio
 */
export function getOrderedPlans(): Plan[] {
  return [
    PLANS[SubscriptionPlan.FREE],
    PLANS[SubscriptionPlan.STARTER],
    PLANS[SubscriptionPlan.GROWTH],
    PLANS[SubscriptionPlan.BUSINESS],
    PLANS[SubscriptionPlan.PRO],
    PLANS[SubscriptionPlan.ENTERPRISE],
  ];
}

/**
 * Verifica si un upgrade es válido (solo se puede subir, no bajar)
 */
export function canUpgradePlan(
  currentPlan: SubscriptionPlan,
  targetPlan: SubscriptionPlan,
): boolean {
  const planOrder = [
    SubscriptionPlan.FREE,
    SubscriptionPlan.STARTER,
    SubscriptionPlan.GROWTH,
    SubscriptionPlan.BUSINESS,
    SubscriptionPlan.PRO,
    SubscriptionPlan.ENTERPRISE,
  ];

  const currentIndex = planOrder.indexOf(currentPlan);
  const targetIndex = planOrder.indexOf(targetPlan);

  return targetIndex > currentIndex;
}

/**
 * Valida si los valores custom de ENTERPRISE son válidos
 */
export function validateEnterpriseConfig(config: EnterprisePlanConfig): boolean {
  if (config.customMonthlyPrice !== undefined && config.customMonthlyPrice < 0) {
    return false;
  }

  if (config.customMonthlyCredits !== undefined && config.customMonthlyCredits < 0) {
    return false;
  }

  if (config.customMaxWorkflows !== undefined && config.customMaxWorkflows < 1) {
    return false;
  }

  if (config.customOverageLimit !== undefined && config.customOverageLimit < 0) {
    return false;
  }

  return true;
}
