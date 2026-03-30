'use client';

import { Check, Loader2, Zap, TrendingUp, Crown, Rocket, Building2 } from 'lucide-react';
import { BillingPlan, SubscriptionPlan } from '@tesseract/types';
import PermissionGuard from '@/components/auth/PermissionGuard';

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
  // Sort plans by price to ensure order
  const sortedPlans = [...(plans || [])].sort((a, b) => a.price.monthly - b.price.monthly);

  return (
    <div className="flex flex-wrap justify-center gap-6">
      {sortedPlans.map((plan) => (
        <div
          key={plan.type}
          className={`relative flex flex-grow basis-[calc(100%)] flex-col rounded-2xl border bg-white transition-all duration-300 hover:border-black/20 sm:basis-[calc(50%-12px)] lg:basis-[calc(33.33%-16px)] 2xl:basis-[calc(20%-20px)] dark:bg-[#0A0A0A] dark:hover:border-white/20 ${plan.popular ? 'border-black shadow-lg ring-1 ring-black dark:border-white dark:ring-white' : 'border-black/5 dark:border-white/5'}`}
        >
          {plan.popular && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-black px-3 py-1 text-xs font-bold uppercase tracking-wide text-white dark:bg-white dark:text-black">
              Recomendado
            </div>
          )}

          <div className="flex-1 p-6">
            <div
              className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-black/5 text-black/80 transition-colors group-hover:bg-black group-hover:text-white dark:bg-white/5 dark:text-white/80 dark:group-hover:bg-white dark:group-hover:text-black`}
            >
              {getPlanIcon(plan.type)}
            </div>

            <h3 className="text-lg font-bold text-black dark:text-white">{plan.name}</h3>
            <p className="mt-1 min-h-[40px] text-sm text-black/50 dark:text-white/50">
              {plan.description}
            </p>

            <div className="mt-4 flex items-baseline gap-1">
              <span className="font-geist-mono text-3xl font-bold text-black dark:text-white">
                ${plan.price.monthly}
              </span>
              <span className="text-sm font-medium text-black/40 dark:text-white/40">
                /{plan.price.currency}
              </span>
            </div>

            {/* Limits */}
            <div className="mt-6 space-y-3 border-t border-black/5 pt-6 dark:border-white/5">
              {/* Credits */}
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-black/70 dark:text-white/70">
                  <strong className="font-geist-mono text-black dark:text-white">
                    {plan.limits.monthlyCredits.toLocaleString()}
                  </strong>{' '}
                  créditos/mes
                </span>
              </div>

              {/* Workflows */}
              <div className="flex items-center gap-2 text-sm text-black/70 dark:text-white/70">
                <span>
                  {plan.limits.maxWorkflows === -1 ? (
                    'Workflows ilimitados'
                  ) : (
                    <>
                      <span className="font-geist-mono">{plan.limits.maxWorkflows}</span> Workflows
                    </>
                  )}
                </span>
              </div>

              {/* API Keys */}
              <div className="flex items-center gap-2 text-sm text-black/70 dark:text-white/70">
                <span>
                  {plan.limits.maxApiKeys === -1 ? (
                    'API Keys ilimitadas'
                  ) : (
                    <>
                      <span className="font-geist-mono">{plan.limits.maxApiKeys}</span> API Keys
                    </>
                  )}
                </span>
              </div>

              {/* Users */}
              <div className="flex items-center gap-2 text-sm text-black/70 dark:text-white/70">
                <span>
                  {plan.limits.maxUsers === -1 ? (
                    'Usuarios ilimitados'
                  ) : (
                    <>
                      <span className="font-geist-mono">{plan.limits.maxUsers}</span> Usuarios
                    </>
                  )}
                </span>
              </div>
            </div>

            {/* Features */}
            <div className="mt-6 space-y-3">
              {plan.features.length > 0 && (
                <p className="text-xs font-bold uppercase tracking-wider text-black/30 dark:text-white/30">
                  INCLUYE
                </p>
              )}
              {(plan.features || []).map((feature, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <div className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                    <Check size={10} className="text-emerald-500" />
                  </div>
                  <span className="text-black/70 dark:text-white/70">{feature}</span>
                </div>
              ))}

              {/* Highlight Feature */}
              {plan.highlightFeature && (
                <div className="flex items-center gap-2 text-sm">
                  <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-amber-500/10">
                    <Zap size={10} className="fill-amber-500 text-amber-500" />
                  </div>
                  <span className="font-semibold italic text-black/70 dark:text-white/70">
                    {plan.highlightFeature}
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
                    ? 'cursor-not-allowed border-2 border-transparent bg-black/5 text-black/40 dark:bg-white/5 dark:text-white/40'
                    : 'border-2 border-transparent bg-black text-white shadow-lg hover:opacity-90 dark:bg-white dark:text-black'
                }`}
              >
                {upgradingPlan === plan.type ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : currentPlan === plan.type ? (
                  'Plan Actual'
                ) : (
                  'Seleccionar'
                )}
              </button>
            </PermissionGuard>
          </div>
        </div>
      ))}
    </div>
  );
}
