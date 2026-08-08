/**
 * Sistema de Planes de Suscripción con Créditos
 *
 * Define los planes disponibles, sus límites, y configuración de créditos.
 * Sistema de pre-pago: créditos mensuales con renovación automática.
 *
 * **Los precios no están aquí.** Stripe es la única fuente de verdad de cuánto cuesta cada
 * plan; este archivo describe qué otorga. Ver `BillingPlan`.
 */

import type { BillingCurrency } from '../../platform/common/countries';

// ============================================
// ENUMS
// ============================================
/**
 * Categorías de workflow compartidas entre frontend y backend
 */
export enum WorkflowCategory {
  LIGHT = 'LIGHT',
  STANDARD = 'STANDARD',
  ADVANCED = 'ADVANCED',
}

/**
 * Tiers de modelos LLM compartidos entre frontend y backend
 */
export enum ModelTier {
  BASIC = 'BASIC',
  STANDARD = 'STANDARD',
  PREMIUM = 'PREMIUM',
}

/**
 * Planes de suscripción disponibles
 */
export enum SubscriptionPlan {
  FREE = 'FREE',
  STARTER = 'STARTER',
  GROWTH = 'GROWTH',
  BUSINESS = 'BUSINESS',
  PRO = 'PRO',
  ENTERPRISE = 'ENTERPRISE',
}

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
 * Información de un plan: qué otorga, no cuánto cuesta.
 *
 * **Aquí no hay importes a propósito.** El precio de cada plan vive únicamente en Stripe, y
 * `GET /billing/plans` lo resuelve en vivo para devolverlo junto con esta configuración (ver
 * `BillingPlanWithPrices`). Tener el importe también aquí obligaría a un redeploy para cambiar
 * un precio, y dejaría dos cifras que pueden discrepar en silencio: la que se muestra y la que
 * se cobra.
 */
export interface BillingPlan {
  type: SubscriptionPlan;
  name: string;
  description: string;
  limits: PlanLimits;

  // UI
  features: string[]; // Lista de características para mostrar en pricing
  highlightFeature?: string; // Feature destacado (ej: "+1 Workflow de regalo")
  popular?: boolean; // Si es el plan recomendado
}

/**
 * Importes de un plan por moneda, en **unidades mínimas** (centavos), tal como los entrega
 * Stripe. Se formatean con `formatMoney`.
 *
 * Es parcial porque no todos los planes tienen precio en Stripe: `FREE` no cobra y
 * `ENTERPRISE` se negocia por `Subscription.customMonthlyPrice`.
 */
export type PlanPrices = Partial<Record<BillingCurrency, number>>;

/** Lo que devuelve `GET /billing/plans`: la config del plan más sus importes vigentes. */
export interface BillingPlanWithPrices extends BillingPlan {
  price: PlanPrices;
}

/**
 * Respuesta de `GET /billing/plans`.
 *
 * El precio del overage viaja aquí y no en un endpoint aparte porque sale del mismo catálogo de
 * Stripe y la UI lo necesita en las mismas pantallas: pedirlo por separado duplicaría la
 * consulta para mostrar dos cifras de la misma página.
 */
export interface BillingPlansResponse {
  plans: BillingPlanWithPrices[];
  /** Precio por crédito de overage, por moneda, en unidades mínimas. */
  overagePerCredit: PlanPrices;
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
    maxTokens: 100_000,
    allowedModelTiers: [ModelTier.BASIC, ModelTier.STANDARD, ModelTier.PREMIUM],
    description: 'Workflows completos con múltiples pasos y herramientas',
  },
  [WorkflowCategory.ADVANCED]: {
    category: WorkflowCategory.ADVANCED,
    credits: 20,
    maxTokens: 250_000,
    allowedModelTiers: [ModelTier.BASIC, ModelTier.STANDARD, ModelTier.PREMIUM],
    description: 'Agentes complejos multi-step con reasoning avanzado',
  },
};

// ============================================
// CONFIGURACIÓN DE PLANES
// ============================================
/**
 * Orden de los planes, de menor a mayor.
 *
 * Es la única definición de "cuál está por encima de cuál". Antes esa relación se deducía
 * comparando `price.monthly`, lo cual dejó de ser posible al sacar los importes del archivo —
 * y de todas formas era incorrecto en cuanto hay dos monedas: el orden entre planes no depende
 * de en cuál se cobre.
 */
export const PLAN_ORDER: SubscriptionPlan[] = [
  SubscriptionPlan.FREE,
  SubscriptionPlan.STARTER,
  SubscriptionPlan.GROWTH,
  SubscriptionPlan.BUSINESS,
  SubscriptionPlan.PRO,
  SubscriptionPlan.ENTERPRISE,
];

/**
 * Configuración completa de todos los planes
 */
export const PLANS: Record<SubscriptionPlan, BillingPlan> = {
  [SubscriptionPlan.FREE]: {
    type: SubscriptionPlan.FREE,
    name: 'Free',
    description: 'Plan gratuito con límites básicos',
    limits: {
      maxUsers: 1,
      maxWorkflows: 3,
      maxApiKeys: 3,
      monthlyCredits: 0,
      overageLimit: 0,
      allowOverages: false,
    },
    features: [],
    popular: false,
  },

  [SubscriptionPlan.STARTER]: {
    type: SubscriptionPlan.STARTER,
    name: 'Starter',
    description: 'Perfecto para empezar a automatizar tareas',
    limits: {
      maxUsers: 10,
      maxWorkflows: 10,
      maxApiKeys: 50,
      monthlyCredits: 200,
      overageLimit: 200,
      allowOverages: true,
    },
    features: ['Soporte estándar por email'],
    popular: false,
  },

  [SubscriptionPlan.GROWTH]: {
    type: SubscriptionPlan.GROWTH,
    name: 'Growth',
    description: 'Para equipos que escalan sus operaciones',
    limits: {
      maxUsers: 25,
      maxWorkflows: 25,
      maxApiKeys: 100,
      monthlyCredits: 650,
      overageLimit: 650,
      allowOverages: true,
    },
    features: ['Soporte prioritario 24h'],
    highlightFeature: '+1 Workflow de regalo',
    popular: true,
  },

  [SubscriptionPlan.BUSINESS]: {
    type: SubscriptionPlan.BUSINESS,
    name: 'Business',
    description: 'Para empresas con alta demanda',
    limits: {
      maxUsers: 50,
      maxWorkflows: 100,
      maxApiKeys: 250,
      monthlyCredits: 1800,
      overageLimit: 1800,
      allowOverages: true,
    },
    features: ['Soporte prioritario 12h'],
    highlightFeature: '1 hrs Consultoría',
    popular: false,
  },

  [SubscriptionPlan.PRO]: {
    type: SubscriptionPlan.PRO,
    name: 'Pro',
    description: 'Para organizaciones que necesitan máxima capacidad',
    limits: {
      maxUsers: 100,
      maxWorkflows: 250,
      maxApiKeys: 500,
      monthlyCredits: 5000,
      overageLimit: 5000,
      allowOverages: true,
    },
    features: ['Account Manager'],
    highlightFeature: '3 hrs Consultoría',
    popular: false,
  },

  [SubscriptionPlan.ENTERPRISE]: {
    type: SubscriptionPlan.ENTERPRISE,
    name: 'Enterprise',
    description: 'Solución personalizada para grandes organizaciones',
    limits: {
      maxUsers: -1, // Ilimitado (se configura custom)
      maxWorkflows: -1, // Ilimitado (se configura custom)
      maxApiKeys: -1, // Ilimitado (se configura custom)
      monthlyCredits: -1, // Ilimitado (se configura custom)
      overageLimit: -1, // Ilimitado (se configura custom)
      allowOverages: true,
    },
    features: ['Todo es personalizado', 'Contáctanos'],
    popular: false,
  },
};

// ============================================
// HELPERS
// ============================================

/**
 * Obtiene la configuración de un plan
 */
export function getPlan(planType: SubscriptionPlan): BillingPlan {
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
 * Costo del overage en unidades mínimas de la moneda de cobro.
 *
 * `unitAmountMinor` es el precio por crédito tal como lo entrega Stripe (centavos). Se recibe
 * como parámetro en vez de leerse de una constante porque el importe depende de la moneda y
 * vive únicamente en Stripe; quien llame ya lo tiene, vía `GET /billing/plans`.
 */
export function calculateOverageCost(overageCredits: number, unitAmountMinor: number): number {
  return Math.abs(overageCredits) * unitAmountMinor;
}

/**
 * Obtiene todos los planes en orden ascendente
 */
export function getOrderedPlans(): BillingPlan[] {
  return PLAN_ORDER.map((plan) => PLANS[plan]);
}

/**
 * Verifica si un upgrade es válido (solo se puede subir, no bajar)
 */
export function canUpgradePlan(
  currentPlan: SubscriptionPlan,
  targetPlan: SubscriptionPlan,
): boolean {
  return PLAN_ORDER.indexOf(targetPlan) > PLAN_ORDER.indexOf(currentPlan);
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
