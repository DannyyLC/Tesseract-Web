'use client';

import { Check, Loader2, Zap, TrendingUp, Crown, Rocket, Building2 } from 'lucide-react';
import { BillingPlan, SubscriptionPlan } from '@tesseract/types';
import PermissionGuard from '@/components/auth/permission-guard';
import { useTranslations } from 'next-intl';

interface PlanGridProps {
  plans: BillingPlan[];
  currentPlan: string;
  onUpgrade: (planName: string) => void;
  upgradingPlan: string | null;
}

const getPlanIcon = (type: string) => {
  switch (type) {
    case SubscriptionPlan.STARTER:
      return <Rocket size={20} />;
    case SubscriptionPlan.GROWTH:
      return <TrendingUp size={20} />;
    case SubscriptionPlan.BUSINESS:
      return <Building2 size={20} />;
    case SubscriptionPlan.ENTERPRISE:
      return <Crown size={20} />;
    default:
      return <Zap size={20} />;
  }
};

export default function PlanGrid({ plans, currentPlan, onUpgrade, upgradingPlan }: PlanGridProps) {
  const t = useTranslations('BillingPlanGrid');

  const planContent: Record<string, { desc: string; features: string[]; highlight?: string }> = {
    [SubscriptionPlan.FREE]: { desc: t('freeDesc'), features: [] },
    [SubscriptionPlan.STARTER]: { desc: t('starterDesc'), features: [t('starterFeature0')] },
    [SubscriptionPlan.GROWTH]: { desc: t('growthDesc'), features: [t('growthFeature0')], highlight: t('growthHighlight') },
    [SubscriptionPlan.BUSINESS]: { desc: t('businessDesc'), features: [t('businessFeature0')], highlight: t('businessHighlight') },
    [SubscriptionPlan.PRO]: { desc: t('proDesc'), features: [t('proFeature0')], highlight: t('proHighlight') },
    [SubscriptionPlan.ENTERPRISE]: { desc: t('enterpriseDesc'), features: [t('enterpriseFeature0'), t('enterpriseFeature1')] },
  };

  // Sort plans by price to ensure order
  const sortedPlans = [...(plans || [])].sort((a, b) => a.price.monthly - b.price.monthly);

  return (
    <div className="flex flex-wrap justify-center gap-6">
      {sortedPlans.map((plan) => (
        <div
          key={plan.type}
          className={`relative flex flex-grow basis-[calc(100%)] flex-col rounded-2xl border bg-surface transition-all duration-300 hover:border-border-hover sm:basis-[calc(50%-12px)] lg:basis-[calc(33.33%-16px)] 2xl:basis-[calc(20%-20px)] ${plan.popular ? 'border-accent shadow-lg ring-1 ring-accent' : 'border-border'}`}
        >
          {plan.popular && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-1 text-xs font-bold uppercase tracking-wide text-text-inverse">
              {t('recommended')}
            </div>
          )}

          <div className="flex-1 p-6">
            <div
              className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-surface-secondary text-text-secondary transition-colors group-hover:bg-accent group-hover:text-text-inverse`}
            >
              {getPlanIcon(plan.type)}
            </div>

            <h3 className="text-lg font-bold text-text-primary">{plan.name}</h3>
            <p className="mt-1 min-h-[40px] text-sm text-text-secondary">{planContent[plan.type]?.desc ?? plan.description}</p>

            <div className="mt-4 flex items-baseline gap-1">
              <span className="font-geist-mono text-3xl font-bold text-text-primary">
                ${plan.price.monthly}
              </span>
              <span className="text-sm font-medium text-text-tertiary">/{plan.price.currency}</span>
            </div>

            {/* Limits */}
            <div className="mt-6 space-y-3 border-t border-border pt-6">
              {/* Credits */}
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-text-primary">
                  <strong className="font-geist-mono text-text-primary">
                    {plan.limits.monthlyCredits.toLocaleString()}
                  </strong>{' '}
                  {t('creditsPerMonth')}
                </span>
              </div>

              {/* Workflows */}
              <div className="flex items-center gap-2 text-sm text-text-primary">
                <span>
                  {plan.limits.maxWorkflows === -1 ? (
                    t('unlimitedWorkflows')
                  ) : (
                    <>
                      <span className="font-geist-mono">{plan.limits.maxWorkflows}</span>
                      {t('workflows')}
                    </>
                  )}
                </span>
              </div>

              {/* API Keys */}
              <div className="flex items-center gap-2 text-sm text-text-primary">
                <span>
                  {plan.limits.maxApiKeys === -1 ? (
                    t('unlimitedApiKeys')
                  ) : (
                    <>
                      <span className="font-geist-mono">{plan.limits.maxApiKeys}</span>
                      {t('apiKeys')}
                    </>
                  )}
                </span>
              </div>

              {/* Users */}
              <div className="flex items-center gap-2 text-sm text-text-primary">
                <span>
                  {plan.limits.maxUsers === -1 ? (
                    t('unlimitedUsers')
                  ) : (
                    <>
                      <span className="font-geist-mono">{plan.limits.maxUsers}</span>
                      {t('users')}
                    </>
                  )}
                </span>
              </div>
            </div>

            {/* Features */}
            <div className="mt-6 space-y-3">
              {(planContent[plan.type]?.features ?? plan.features).length > 0 && (
                <p className="text-xs font-bold uppercase tracking-wider text-text-tertiary">
                  {t('includes')}
                </p>
              )}
              {(planContent[plan.type]?.features ?? plan.features).map((feature, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <div className="bg-success-500/10 mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full">
                    <Check size={10} className="text-success-500" />
                  </div>
                  <span className="text-text-primary">{feature}</span>
                </div>
              ))}

              {/* Highlight Feature */}
              {(planContent[plan.type]?.highlight ?? plan.highlightFeature) && (
                <div className="flex items-center gap-2 text-sm">
                  <div className="bg-warning-500/10 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full">
                    <Zap size={10} className="fill-warning-500 text-warning-500" />
                  </div>
                  <span className="font-semibold italic text-text-primary">
                    {planContent[plan.type]?.highlight ?? plan.highlightFeature}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="p-6 pt-0">
            <PermissionGuard permissions="billing:update_plan">
              <button
                onClick={() => onUpgrade(plan.type)}
                disabled={upgradingPlan !== null || currentPlan === plan.type}
                className={`flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold transition-all ${
                  currentPlan === plan.type
                    ? 'cursor-not-allowed border-2 border-transparent bg-surface-secondary text-text-tertiary'
                    : 'border-2 border-transparent bg-accent text-text-inverse shadow-lg hover:opacity-90'
                }`}
              >
                {upgradingPlan === plan.type ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : currentPlan === plan.type ? (
                  t('currentPlan')
                ) : (
                  t('selectButton')
                )}
              </button>
            </PermissionGuard>
          </div>
        </div>
      ))}
    </div>
  );
}
