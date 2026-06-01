import { motion } from 'framer-motion';
import { Shield, CreditCard, AlertTriangle, ArrowDownRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { SubscriptionPlan, OVERAGE_PRICE_PER_CREDIT } from '@tesseract/types';

interface BillingHeroProps {
  plan: SubscriptionPlan;
  status: string;
  nextBillingDate: string | Date | null;
  credits: {
    available: number;
    usedThisMonth: number;
    limit: number;
  };
  cancelAtPeriodEnd?: boolean;
  pendingPlanChange?: string | null;
  allowOverages?: boolean;
  maxOverageLimit?: number;
  currentOverageLimit?: number;
}

export default function BillingHero({
  plan,
  status,
  nextBillingDate,
  credits,
  cancelAtPeriodEnd = false,
  pendingPlanChange = null,
}: BillingHeroProps) {
  const t = useTranslations('BillingHero');
  const isNegative = credits.available < 0;
  const formattedBalance = Math.abs(credits.available).toLocaleString();
  const nextDateFormatted = nextBillingDate
    ? new Date(nextBillingDate).toLocaleDateString('es-MX', { timeZone: 'UTC' })
    : 'N/A';

  // Plan Display Helper
  const getPlanLabel = (p: SubscriptionPlan) => {
    if (p === SubscriptionPlan.FREE) return t('planFree');
    return t('planPremium');
  };

  // Subscription Status Helper
  const getStatusConfig = (s: string) => {
    switch (s) {
      case 'active':
      case 'ACTIVE':
        return {
          label: t('statusActive'),
          color: 'bg-success-500',
          text: 'text-success-400',
          bg: 'bg-success-500/20',
        };
      case 'PAST_DUE':
      case 'past_due':
        return {
          label: t('statusPastDue'),
          color: 'bg-danger',
          text: 'text-danger-400',
          bg: 'bg-danger/20',
        };
      case 'CANCELED':
      case 'canceled':
        return {
          label: t('statusCanceled'),
          color: 'bg-neutral-500',
          text: 'text-neutral-400',
          bg: 'bg-neutral-500/20',
        };
      default:
        return {
          label: s,
          color: 'bg-neutral-500',
          text: 'text-neutral-400',
          bg: 'bg-neutral-500/20',
        };
    }
  };
  // If user is on FREE plan, they're always "Active" from their perspective
  // CANCELED is an internal state of the previous subscription, not relevant to show
  const effectiveStatus = plan === SubscriptionPlan.FREE ? 'ACTIVE' : status;
  const statusConfig = getStatusConfig(effectiveStatus);

  return (
    <div className="relative overflow-hidden rounded-3xl bg-accent p-8 text-text-inverse shadow-2xl transition-all">
      {/* Background decoration */}
      <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/5 blur-3xl" />
      <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-white/5 blur-3xl" />

      <div className="relative z-10 flex flex-col justify-between gap-10 lg:flex-row lg:items-end">
        {/* Left Side: Credits */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium uppercase tracking-widest opacity-60">
            {isNegative ? (
              <>
                <span className="text-danger-500">{t('negativeBalance')}</span>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <span>{t('availableCredits')}</span>
              </div>
            )}
          </div>

          <div className="flex items-baseline gap-2">
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`font-geist-mono text-7xl font-light tracking-tighter ${isNegative ? 'text-danger-500' : ''}`}
            >
              {isNegative ? '-' : ''}
              {formattedBalance}
            </motion.span>
            <span className="text-xl font-medium opacity-40">{t('creditsUnit')}</span>
          </div>

          {/* Negative Balance Helper Text */}
          {isNegative && (
            <p className="max-w-md text-sm text-danger-500">
              {t('overdraftText', { price: OVERAGE_PRICE_PER_CREDIT })}
            </p>
          )}
        </div>

        {/* Right Side: Subscription Info */}
        <div className="flex flex-col gap-6 lg:items-end lg:text-right">
          {/* Plan Badge */}
          <div className="flex items-center gap-3 lg:flex-row-reverse">
            <div className="rounded-xl bg-white/10 p-2.5 backdrop-blur-md">
              <CreditCard size={24} className="opacity-80" />
            </div>
            <div>
              <h3 className="text-xl font-bold leading-none">{plan}</h3>
              <p className="text-xs font-medium uppercase tracking-wider opacity-50">
                {getPlanLabel(plan)}
              </p>
            </div>
          </div>

          {/* Billing Info */}
          <div className="space-y-1">
            {cancelAtPeriodEnd ? (
              <div className="bg-warning-500/20 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest text-warning-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warning-500" />
                {t('pendingCancellation')}
              </div>
            ) : pendingPlanChange ? (
              <div className="bg-info/20 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest text-info-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-info" />
                {t('scheduledChange', { plan: pendingPlanChange })}
              </div>
            ) : (
              <div
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest ${statusConfig.bg} ${statusConfig.text}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${statusConfig.color} animate-pulse`} />
                {statusConfig.label}
              </div>
            )}

            {(status === 'PAST_DUE' || status === 'past_due') && (
              <p className="max-w-[200px] text-right text-xs text-danger-400">
                {t.rich('paymentFailedText', {
                  bold: (chunks) => <strong>{chunks}</strong>,
                })}
              </p>
            )}

            {nextBillingDate && plan !== SubscriptionPlan.FREE && status !== 'CANCELED' && (
              <div className="flex items-center gap-2 text-sm opacity-50 lg:justify-end">
                {cancelAtPeriodEnd ? (
                  <>
                    <AlertTriangle size={14} />
                    <span>{t('cancelsOn', { date: nextDateFormatted })}</span>
                  </>
                ) : pendingPlanChange ? (
                  <>
                    <ArrowDownRight size={14} />
                    <span>
                      {t('changesTo', { plan: pendingPlanChange, date: nextDateFormatted })}
                    </span>
                  </>
                ) : (
                  <>
                    <Shield size={14} />
                    <span>{t('renewsOn', { date: nextDateFormatted })}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
