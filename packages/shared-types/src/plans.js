"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLANS = exports.PlanType = void 0;
exports.getPlan = getPlan;
exports.getPlanLimits = getPlanLimits;
exports.getPlanFeatures = getPlanFeatures;
exports.hasFeature = hasFeature;
exports.isLimitReached = isLimitReached;
exports.canAdd = canAdd;
exports.getAvailableSlots = getAvailableSlots;
exports.isPlanSuperior = isPlanSuperior;
exports.needsUpgrade = needsUpgrade;
exports.getYearlySavings = getYearlySavings;
exports.getAllPlans = getAllPlans;
exports.formatPlanPrice = formatPlanPrice;
exports.validateUserCreation = validateUserCreation;
exports.validateWorkflowCreation = validateWorkflowCreation;
exports.validateApiKeyCreation = validateApiKeyCreation;
var PlanType;
(function (PlanType) {
    PlanType["FREE"] = "free";
    PlanType["PRO"] = "pro";
    PlanType["ENTERPRISE"] = "enterprise";
})(PlanType || (exports.PlanType = PlanType = {}));
exports.PLANS = {
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
            apiRateLimit: 60,
        },
        color: '#10B981',
        icon: '🚀',
    },
    [PlanType.PRO]: {
        type: PlanType.PRO,
        name: 'Pro',
        description: 'Para equipos en crecimiento que necesitan más potencia',
        price: {
            monthly: 49,
            yearly: 470,
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
            apiRateLimit: 300,
        },
        color: '#3B82F6',
        icon: '⚡',
        popular: true,
    },
    [PlanType.ENTERPRISE]: {
        type: PlanType.ENTERPRISE,
        name: 'Enterprise',
        description: 'Para empresas que necesitan escala y soporte premium',
        price: {
            monthly: 299,
            yearly: 2990,
        },
        limits: {
            maxUsers: -1,
            maxWorkflows: -1,
            maxExecutionsPerDay: -1,
            maxApiKeys: -1,
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
            apiRateLimit: 1000,
        },
        color: '#8B5CF6',
        icon: '👑',
    },
};
function getPlan(planType) {
    return exports.PLANS[planType];
}
function getPlanLimits(planType) {
    return exports.PLANS[planType].limits;
}
function getPlanFeatures(planType) {
    return exports.PLANS[planType].features;
}
function hasFeature(planType, feature) {
    return exports.PLANS[planType].features[feature] === true;
}
function isLimitReached(planType, limitType, currentValue) {
    const limit = exports.PLANS[planType].limits[limitType];
    if (limit === -1) {
        return false;
    }
    return currentValue >= limit;
}
function canAdd(planType, limitType, currentValue, amountToAdd = 1) {
    const limit = exports.PLANS[planType].limits[limitType];
    if (limit === -1) {
        return true;
    }
    return (currentValue + amountToAdd) <= limit;
}
function getAvailableSlots(planType, limitType, currentValue) {
    const limit = exports.PLANS[planType].limits[limitType];
    if (limit === -1) {
        return -1;
    }
    return Math.max(0, limit - currentValue);
}
function isPlanSuperior(plan1, plan2) {
    const hierarchy = {
        [PlanType.FREE]: 0,
        [PlanType.PRO]: 1,
        [PlanType.ENTERPRISE]: 2,
    };
    return hierarchy[plan1] > hierarchy[plan2];
}
function needsUpgrade(currentPlan, requiredPlan) {
    return isPlanSuperior(requiredPlan, currentPlan);
}
function getYearlySavings(planType) {
    const plan = exports.PLANS[planType];
    const monthlyTotal = plan.price.monthly * 12;
    const yearlyTotal = plan.price.yearly;
    const amount = monthlyTotal - yearlyTotal;
    const percentage = monthlyTotal > 0 ? Math.round((amount / monthlyTotal) * 100) : 0;
    return { amount, percentage };
}
function getAllPlans() {
    return [
        exports.PLANS[PlanType.FREE],
        exports.PLANS[PlanType.PRO],
        exports.PLANS[PlanType.ENTERPRISE],
    ];
}
function formatPlanPrice(plan, billing) {
    const price = billing === 'monthly' ? plan.price.monthly : plan.price.yearly;
    if (price === 0) {
        return 'Gratis';
    }
    const period = billing === 'monthly' ? 'mes' : 'año';
    return `$${price}/${period}`;
}
function validateUserCreation(planType, currentUsers) {
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
function validateWorkflowCreation(planType, currentWorkflows) {
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
function validateApiKeyCreation(planType, currentApiKeys) {
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
//# sourceMappingURL=plans.js.map