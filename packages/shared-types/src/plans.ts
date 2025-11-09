/**
 * Sistema de Planes de Suscripción
 * 
 * Define los planes disponibles y sus límites.
 * Este archivo centraliza la configuración de planes para mantener
 * consistencia entre frontend y backend.
 */

// ============================================
// ENUMS
// ============================================

/**
 * Planes de suscripción disponibles
 */
export enum PlanType {
  FREE = 'free',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
}

// ============================================
// INTERFACES
// ============================================

/**
 * Límites de un plan
 */
export interface PlanLimits {
  maxUsers: number;           // -1 = ilimitado
  maxWorkflows: number;       // -1 = ilimitado
  maxExecutionsPerDay: number; // -1 = ilimitado
  maxApiKeys: number;         // -1 = ilimitado
}

/**
 * Features de un plan
 */
export interface PlanFeatures {
  customDomain: boolean;
  whatsappIntegration: boolean;
  advancedAnalytics: boolean;
  prioritySupport: boolean;
  sla: boolean;
  ssoIntegration: boolean;
  auditLogs: boolean;
  customRetention: boolean; // Retención personalizada de logs
  webhooks: boolean;
  apiRateLimit: number; // Requests por minuto
}

/**
 * Información completa de un plan
 */
export interface Plan {
  type: PlanType;
  name: string;
  description: string;
  price: {
    monthly: number;  // USD
    yearly: number;   // USD
  };
  limits: PlanLimits;
  features: PlanFeatures;
  color: string;
  icon: string;
  popular?: boolean;
}

// ============================================
// CONFIGURACIÓN DE PLANES
// ============================================

/**
 * Configuración completa de todos los planes
 */
export const PLANS: Record<PlanType, Plan> = {
  [PlanType.FREE]: {
    type: PlanType.FREE,
    name: 'Free',
    description: 'Perfecto para probar y proyectos pequeños',
    price: {
      monthly: 0,
      yearly: 0,
    },
    limits: {
      maxUsers: 3,
      maxWorkflows: 5,
      maxExecutionsPerDay: 100,
      maxApiKeys: 2,
    },
    features: {
      customDomain: false,
      whatsappIntegration: true,
      advancedAnalytics: false,
      prioritySupport: false,
      sla: false,
      ssoIntegration: false,
      auditLogs: false,
      customRetention: false,
      webhooks: true,
      apiRateLimit: 60, // 60 req/min
    },
    color: '#10B981', // Green
    icon: '🚀',
  },
  
  [PlanType.PRO]: {
    type: PlanType.PRO,
    name: 'Pro',
    description: 'Para equipos en crecimiento que necesitan más potencia',
    price: {
      monthly: 49,
      yearly: 470, // ~20% descuento
    },
    limits: {
      maxUsers: 10,
      maxWorkflows: 50,
      maxExecutionsPerDay: 10000,
      maxApiKeys: 10,
    },
    features: {
      customDomain: true,
      whatsappIntegration: true,
      advancedAnalytics: true,
      prioritySupport: true,
      sla: false,
      ssoIntegration: false,
      auditLogs: true,
      customRetention: true,
      webhooks: true,
      apiRateLimit: 300, // 300 req/min
    },
    color: '#3B82F6', // Blue
    icon: '⚡',
    popular: true,
  },
  
  [PlanType.ENTERPRISE]: {
    type: PlanType.ENTERPRISE,
    name: 'Enterprise',
    description: 'Para empresas que necesitan escala y soporte premium',
    price: {
      monthly: 299,
      yearly: 2990, // ~17% descuento
    },
    limits: {
      maxUsers: -1,        // Ilimitado
      maxWorkflows: -1,    // Ilimitado
      maxExecutionsPerDay: -1, // Ilimitado
      maxApiKeys: -1,      // Ilimitado
    },
    features: {
      customDomain: true,
      whatsappIntegration: true,
      advancedAnalytics: true,
      prioritySupport: true,
      sla: true,
      ssoIntegration: true,
      auditLogs: true,
      customRetention: true,
      webhooks: true,
      apiRateLimit: 1000, // 1000 req/min
    },
    color: '#8B5CF6', // Purple
    icon: '👑',
  },
};

// ============================================
// HELPERS
// ============================================

/**
 * Obtiene la configuración de un plan
 * 
 * @param planType - Tipo de plan
 * @returns Configuración del plan
 */
export function getPlan(planType: PlanType): Plan {
  return PLANS[planType];
}

/**
 * Obtiene los límites de un plan
 * 
 * @param planType - Tipo de plan
 * @returns Límites del plan
 */
export function getPlanLimits(planType: PlanType): PlanLimits {
  return PLANS[planType].limits;
}

/**
 * Obtiene las features de un plan
 * 
 * @param planType - Tipo de plan
 * @returns Features del plan
 */
export function getPlanFeatures(planType: PlanType): PlanFeatures {
  return PLANS[planType].features;
}

/**
 * Verifica si un plan tiene una feature específica
 * 
 * @param planType - Tipo de plan
 * @param feature - Feature a verificar
 * @returns true si el plan tiene la feature
 */
export function hasFeature(planType: PlanType, feature: keyof PlanFeatures): boolean {
  return PLANS[planType].features[feature] === true;
}

/**
 * Verifica si un límite está alcanzado
 * 
 * @param planType - Tipo de plan
 * @param limitType - Tipo de límite
 * @param currentValue - Valor actual
 * @returns true si el límite está alcanzado
 */
export function isLimitReached(
  planType: PlanType,
  limitType: keyof PlanLimits,
  currentValue: number,
): boolean {
  const limit = PLANS[planType].limits[limitType];
  
  // -1 significa ilimitado
  if (limit === -1) {
    return false;
  }
  
  return currentValue >= limit;
}

/**
 * Verifica si se puede agregar más de un recurso
 * 
 * @param planType - Tipo de plan
 * @param limitType - Tipo de límite
 * @param currentValue - Valor actual
 * @param amountToAdd - Cantidad a agregar (default: 1)
 * @returns true si se puede agregar
 */
export function canAdd(
  planType: PlanType,
  limitType: keyof PlanLimits,
  currentValue: number,
  amountToAdd: number = 1,
): boolean {
  const limit = PLANS[planType].limits[limitType];
  
  // -1 significa ilimitado
  if (limit === -1) {
    return true;
  }
  
  return (currentValue + amountToAdd) <= limit;
}

/**
 * Calcula cuántos recursos más se pueden agregar
 * 
 * @param planType - Tipo de plan
 * @param limitType - Tipo de límite
 * @param currentValue - Valor actual
 * @returns Cantidad disponible (-1 si es ilimitado)
 */
export function getAvailableSlots(
  planType: PlanType,
  limitType: keyof PlanLimits,
  currentValue: number,
): number {
  const limit = PLANS[planType].limits[limitType];
  
  // -1 significa ilimitado
  if (limit === -1) {
    return -1;
  }
  
  return Math.max(0, limit - currentValue);
}

/**
 * Compara dos planes y retorna si el primero es superior
 * 
 * @param plan1 - Primer plan
 * @param plan2 - Segundo plan
 * @returns true si plan1 es superior a plan2
 */
export function isPlanSuperior(plan1: PlanType, plan2: PlanType): boolean {
  const hierarchy = {
    [PlanType.FREE]: 0,
    [PlanType.PRO]: 1,
    [PlanType.ENTERPRISE]: 2,
  };
  
  return hierarchy[plan1] > hierarchy[plan2];
}

/**
 * Verifica si un upgrade es necesario para una acción
 * 
 * @param currentPlan - Plan actual
 * @param requiredPlan - Plan requerido
 * @returns true si necesita upgrade
 */
export function needsUpgrade(currentPlan: PlanType, requiredPlan: PlanType): boolean {
  return isPlanSuperior(requiredPlan, currentPlan);
}

/**
 * Calcula el ahorro anual vs mensual
 * 
 * @param planType - Tipo de plan
 * @returns Ahorro en USD y porcentaje
 */
export function getYearlySavings(planType: PlanType): { amount: number; percentage: number } {
  const plan = PLANS[planType];
  const monthlyTotal = plan.price.monthly * 12;
  const yearlyTotal = plan.price.yearly;
  const amount = monthlyTotal - yearlyTotal;
  const percentage = monthlyTotal > 0 ? Math.round((amount / monthlyTotal) * 100) : 0;
  
  return { amount, percentage };
}

/**
 * Obtiene todos los planes ordenados por precio
 * 
 * @returns Array de planes ordenados
 */
export function getAllPlans(): Plan[] {
  return [
    PLANS[PlanType.FREE],
    PLANS[PlanType.PRO],
    PLANS[PlanType.ENTERPRISE],
  ];
}

/**
 * Formatea el precio de un plan para mostrar en UI
 * 
 * @param plan - Plan
 * @param billing - 'monthly' o 'yearly'
 * @returns String formateado (ej: "$49/mes")
 */
export function formatPlanPrice(plan: Plan, billing: 'monthly' | 'yearly'): string {
  const price = billing === 'monthly' ? plan.price.monthly : plan.price.yearly;
  
  if (price === 0) {
    return 'Gratis';
  }
  
  const period = billing === 'monthly' ? 'mes' : 'año';
  return `$${price}/${period}`;
}

/**
 * Valida límites de organización contra su plan
 * 
 * Útil para verificar antes de crear recursos
 */
export interface LimitValidation {
  isValid: boolean;
  limitType?: keyof PlanLimits;
  limit?: number;
  current?: number;
  message?: string;
}

/**
 * Valida si se puede crear un usuario
 */
export function validateUserCreation(
  planType: PlanType,
  currentUsers: number,
): LimitValidation {
  if (canAdd(planType, 'maxUsers', currentUsers)) {
    return { isValid: true };
  }
  
  const limit = getPlanLimits(planType).maxUsers;
  return {
    isValid: false,
    limitType: 'maxUsers',
    limit,
    current: currentUsers,
    message: `Has alcanzado el límite de ${limit} usuarios en tu plan ${planType}`,
  };
}

/**
 * Valida si se puede crear un workflow
 */
export function validateWorkflowCreation(
  planType: PlanType,
  currentWorkflows: number,
): LimitValidation {
  if (canAdd(planType, 'maxWorkflows', currentWorkflows)) {
    return { isValid: true };
  }
  
  const limit = getPlanLimits(planType).maxWorkflows;
  return {
    isValid: false,
    limitType: 'maxWorkflows',
    limit,
    current: currentWorkflows,
    message: `Has alcanzado el límite de ${limit} workflows en tu plan ${planType}`,
  };
}

/**
 * Valida si se puede crear una API key
 */
export function validateApiKeyCreation(
  planType: PlanType,
  currentApiKeys: number,
): LimitValidation {
  if (canAdd(planType, 'maxApiKeys', currentApiKeys)) {
    return { isValid: true };
  }
  
  const limit = getPlanLimits(planType).maxApiKeys;
  return {
    isValid: false,
    limitType: 'maxApiKeys',
    limit,
    current: currentApiKeys,
    message: `Has alcanzado el límite de ${limit} API keys en tu plan ${planType}`,
  };
}
