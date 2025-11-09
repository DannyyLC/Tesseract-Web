export declare enum PlanType {
    FREE = "free",
    PRO = "pro",
    ENTERPRISE = "enterprise"
}
export interface PlanLimits {
    maxUsers: number;
    maxWorkflows: number;
    maxExecutionsPerDay: number;
    maxApiKeys: number;
}
export interface PlanFeatures {
    customDomain: boolean;
    whatsappIntegration: boolean;
    advancedAnalytics: boolean;
    prioritySupport: boolean;
    sla: boolean;
    ssoIntegration: boolean;
    auditLogs: boolean;
    customRetention: boolean;
    webhooks: boolean;
    apiRateLimit: number;
}
export interface Plan {
    type: PlanType;
    name: string;
    description: string;
    price: {
        monthly: number;
        yearly: number;
    };
    limits: PlanLimits;
    features: PlanFeatures;
    color: string;
    icon: string;
    popular?: boolean;
}
export declare const PLANS: Record<PlanType, Plan>;
export declare function getPlan(planType: PlanType): Plan;
export declare function getPlanLimits(planType: PlanType): PlanLimits;
export declare function getPlanFeatures(planType: PlanType): PlanFeatures;
export declare function hasFeature(planType: PlanType, feature: keyof PlanFeatures): boolean;
export declare function isLimitReached(planType: PlanType, limitType: keyof PlanLimits, currentValue: number): boolean;
export declare function canAdd(planType: PlanType, limitType: keyof PlanLimits, currentValue: number, amountToAdd?: number): boolean;
export declare function getAvailableSlots(planType: PlanType, limitType: keyof PlanLimits, currentValue: number): number;
export declare function isPlanSuperior(plan1: PlanType, plan2: PlanType): boolean;
export declare function needsUpgrade(currentPlan: PlanType, requiredPlan: PlanType): boolean;
export declare function getYearlySavings(planType: PlanType): {
    amount: number;
    percentage: number;
};
export declare function getAllPlans(): Plan[];
export declare function formatPlanPrice(plan: Plan, billing: 'monthly' | 'yearly'): string;
export interface LimitValidation {
    isValid: boolean;
    limitType?: keyof PlanLimits;
    limit?: number;
    current?: number;
    message?: string;
}
export declare function validateUserCreation(planType: PlanType, currentUsers: number): LimitValidation;
export declare function validateWorkflowCreation(planType: PlanType, currentWorkflows: number): LimitValidation;
export declare function validateApiKeyCreation(planType: PlanType, currentApiKeys: number): LimitValidation;
//# sourceMappingURL=plans.d.ts.map