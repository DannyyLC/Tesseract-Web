export const SUBSCRIPTION_PLANS = {
  STARTER: {
    name: 'STARTER',
    priceIdEnvKey: 'STRIPE_PRICE_STARTER',
    credits: 150,
    priceUSD: 25,
  },
  GROWTH: {
    name: 'GROWTH',
    priceIdEnvKey: 'STRIPE_PRICE_GROWTH',
    credits: 500,
    priceUSD: 79,
  },
  BUSINESS: {
    name: 'BUSINESS',
    priceIdEnvKey: 'STRIPE_PRICE_BUSINESS',
    credits: 1500,
    priceUSD: 199,
  },
  PRO: {
    name: 'PRO',
    priceIdEnvKey: 'STRIPE_PRICE_PRO',
    credits: 5000,
    priceUSD: 499,
  },
  FREE: {
    name: 'FREE',
    priceIdEnvKey: 'STRIPE_PRICE_FREE', // Likely null or special handle
    credits: 0,
    priceUSD: 0,
  },
  ENTERPRISE: {
    name: 'ENTERPRISE',
    priceIdEnvKey: 'STRIPE_PRICE_ENTERPRISE',
    credits: 10000, // Placeholder
    priceUSD: 999, // Placeholder
  },
};

export const OVERAGE_PRICE_PER_CREDIT = 0.01;
