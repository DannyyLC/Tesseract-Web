import { PLANS, SubscriptionPlan } from '@tesseract/types';

export const SUBSCRIPTION_PLANS = {
  [SubscriptionPlan.STARTER]: {
    ...PLANS[SubscriptionPlan.STARTER],
    priceIdEnvKey: 'STRIPE_PRICE_STARTER',
  },
  [SubscriptionPlan.GROWTH]: {
    ...PLANS[SubscriptionPlan.GROWTH],
    priceIdEnvKey: 'STRIPE_PRICE_GROWTH',
  },
  [SubscriptionPlan.BUSINESS]: {
    ...PLANS[SubscriptionPlan.BUSINESS],
    priceIdEnvKey: 'STRIPE_PRICE_BUSINESS',
  },
  [SubscriptionPlan.PRO]: {
    ...PLANS[SubscriptionPlan.PRO],
    priceIdEnvKey: 'STRIPE_PRICE_PRO',
  },
  [SubscriptionPlan.FREE]: {
    ...PLANS[SubscriptionPlan.FREE],
    priceIdEnvKey: 'STRIPE_PRICE_FREE',
  },
  [SubscriptionPlan.ENTERPRISE]: {
    ...PLANS[SubscriptionPlan.ENTERPRISE],
    priceIdEnvKey: 'STRIPE_PRICE_ENTERPRISE',
  },
};

