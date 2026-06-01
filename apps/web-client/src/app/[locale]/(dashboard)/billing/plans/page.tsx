'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/routing';
import { useQueryClient } from '@tanstack/react-query';
import { useBillingDashboard, useBillingMutations } from '@/hooks/billing/use-billing';
import { usePlans } from '@/hooks/billing/use-billing';
import { useWorkflowStats } from '@/hooks/automation/use-workflows';
import { SubscriptionPlan, BillingPlan } from '@tesseract/types';
import PlanGrid from '../_components/plan-grid';
import InfoSections from '../_components/info-sections';
import SpecializedCards from '../_components/specialized-cards';
import { Modal } from '@/components/ui/modal';
import {
  Loader2,
  ArrowLeft,
  PartyPopper,
  RefreshCw,
  ArrowDownRight,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import Loading from '@/app/[locale]/(dashboard)/loading';
import PermissionGuard from '@/components/auth/permission-guard';
import { triggerWowConfetti } from '@/lib/confetti';
import { useTranslations } from 'next-intl';

export default function PlansPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const t = useTranslations('BillingPlans');

  useEffect(() => {
    // Cuando el portal/checkout de Stripe redirige de vuelta, refrescar datos y limpiar la URL.
    if (searchParams.get('from_portal') === '1' || searchParams.get('from_checkout') === '1') {
      queryClient.invalidateQueries({ queryKey: ['billing'] });
      router.refresh();
      const url = new URL(window.location.href);
      url.searchParams.delete('from_portal');
      url.searchParams.delete('from_checkout');
      window.history.replaceState(null, '', url.toString());
    }

    // Refrescar datos cuando el usuario vuelve a esta pestaña (ej: cerró la de Stripe).
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        queryClient.invalidateQueries({ queryKey: ['billing'] });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const { data: dashboardData, isLoading: isLoadingDashboard } = useBillingDashboard();
  const { data: plansData, isLoading: isLoadingPlans } = usePlans();
  const { data: workflowStats } = useWorkflowStats();
  const {
    updateSubscription,
    cancelSubscription,
    resumeSubscription,
    createCheckoutSession,
    cancelPendingDowngrade,
    createPortalSession,
  } = useBillingMutations();

  const [selectedPlan, setSelectedPlan] = useState<BillingPlan | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showAdviceModal, setShowAdviceModal] = useState(false);
  const [pendingPlanType, setPendingPlanType] = useState<string | null>(null);
  const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null);
  const [isCanceling, setIsCanceling] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [showPlanChangeSuccess, setShowPlanChangeSuccess] = useState(false);
  const [showResumeSuccess, setShowResumeSuccess] = useState(false);
  const [changedPlanName, setChangedPlanName] = useState('');
  const [isCancellingDowngrade, setIsCancellingDowngrade] = useState(false);
  const [showCancelDowngradeModal, setShowCancelDowngradeModal] = useState(false);

  // Derive subscription state
  const subscription = {
    plan: dashboardData?.plan || SubscriptionPlan.FREE,
    status: dashboardData?.status,
    currentPeriodEnd: dashboardData?.nextBillingDate,
    cancelAtPeriodEnd: dashboardData?.cancelAtPeriodEnd,
    pendingPlanChange: dashboardData?.pendingPlanChange,
  };

  const handleCancelDowngrade = () => {
    setIsCancellingDowngrade(true);
    cancelPendingDowngrade.mutate(undefined, {
      onSuccess: () => {
        toast.success(t('downgradeCancelSuccess'));
        setIsCancellingDowngrade(false);
      },
      onError: (error: any) => {
        let msg = t('downgradeCancelError');
        if (error?.response?.data?.message) {
          msg = error.response.data.message;
        }
        toast.error(msg);
        setIsCancellingDowngrade(false);
      },
    });
  };

  const handlePlanSelect = (planType: string) => {
    // Check if user is on FREE plan and has 0 workflows
    const isFreePlan = subscription.plan === SubscriptionPlan.FREE;
    const hasZeroWorkflows = workflowStats?.totalWorkflows === 0;

    if (isFreePlan && hasZeroWorkflows) {
      setPendingPlanType(planType);
      setShowAdviceModal(true);
      return;
    }

    const plan = plansData?.find((p) => p.type === planType);
    if (plan) setSelectedPlan(plan);
  };

  const handleProceedWithAdvice = () => {
    setShowAdviceModal(false);
    if (pendingPlanType) {
      const plan = plansData?.find((p) => p.type === pendingPlanType);
      if (plan) setSelectedPlan(plan);
      setPendingPlanType(null);
    }
  };

  const confirmChange = async () => {
    if (!selectedPlan) return;
    try {
      setUpgradingPlan(selectedPlan.type);

      const planState = subscription.plan;
      const subStatus = subscription.status?.toUpperCase() || 'FREE';

      if (subStatus === 'PAST_DUE') {
        const { url } = await createPortalSession.mutateAsync();
        goToStripe(url);
        return;
      }

      const isFreeOrCanceled = planState === SubscriptionPlan.FREE || subStatus === 'CANCELED';

      if (isFreeOrCanceled) {
        const { url } = await createCheckoutSession.mutateAsync(selectedPlan.type);
        goToStripe(url);
      } else {
        try {
          await updateSubscription.mutateAsync(selectedPlan.type as SubscriptionPlan);
          setChangedPlanName(selectedPlan.name);
          setShowPlanChangeSuccess(true);
          triggerWowConfetti();
        } catch (updateError: any) {
          if (updateError?.response?.status === 409) {
            const { url } = await createCheckoutSession.mutateAsync(selectedPlan.type);
            goToStripe(url);
            return;
          }
          if (updateError?.response?.data?.message === 'SUBSCRIPTION_PAST_DUE') {
            const { url } = await createPortalSession.mutateAsync();
            goToStripe(url);
            return;
          }
          throw updateError;
        }
      }
    } finally {
      setUpgradingPlan(null);
      setSelectedPlan(null);
    }
  };

  const handleCancelClick = () => {
    setShowCancelModal(true);
  };

  const confirmCancel = async () => {
    try {
      setIsCanceling(true);
      await cancelSubscription.mutateAsync();
      toast.success(t('cancelSuccessToast'));
    } finally {
      setIsCanceling(false);
      setShowCancelModal(false);
    }
  };

  const confirmResume = async () => {
    try {
      setIsResuming(true);
      await resumeSubscription.mutateAsync();
      setShowResumeSuccess(true);
    } finally {
      setIsResuming(false);
      setShowResumeModal(false);
    }
  };

  const goToStripe = (url: string) => {
    window.open(url, '_blank');
  };

  const currentPlanDetails = plansData?.find((p) => p.type === subscription.plan);
  const isUpgrade =
    selectedPlan &&
    currentPlanDetails &&
    selectedPlan.price.monthly > currentPlanDetails.price.monthly;

  if (isLoadingDashboard || isLoadingPlans) {
    return <Loading />;
  }

  return (
    <PermissionGuard permissions="billing:read" redirect={true} fallbackRoute="/dashboard">
      <div className="space-y-10 pb-20">
        {/* Back Navigation */}
        <div>
          <button
            onClick={() => router.back()}
            className="group flex items-center gap-2 text-sm font-medium text-text-tertiary transition-colors hover:text-text-primary"
          >
            <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-1" />
            {t('back')}
          </button>
        </div>

        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-text-primary">{t('heading')}</h1>
          <p className="max-w-xl font-medium text-text-secondary">{t('description')}</p>
        </div>

        {/* Past Due / Failed Payment Banner */}
        {subscription.status?.toUpperCase() === 'PAST_DUE' && (
          <div className="border-danger-500/20 bg-danger/5 flex items-center justify-between gap-4 rounded-2xl border p-5">
            <div className="flex items-center gap-4">
              <div className="bg-danger/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                <AlertCircle size={20} className="text-danger" />
              </div>
              <div>
                <p className="text-sm font-bold text-text-primary">{t('paymentPendingTitle')}</p>
                <p className="text-xs text-text-secondary">{t('paymentPendingDesc')}</p>
              </div>
            </div>
            <button
              onClick={async () => {
                const { url } = await createPortalSession.mutateAsync();
                goToStripe(url);
              }}
              className="bg-danger/10 hover:bg-danger/20 shrink-0 rounded-lg px-4 py-2 text-sm font-bold text-danger-600 transition-colors"
            >
              {t('updatePayment')}
            </button>
          </div>
        )}

        {/* Pending Plan Change Banner */}
        {subscription.pendingPlanChange && (
          <div className="border-info-500/20 bg-info/5 flex items-center justify-between gap-4 rounded-2xl border p-5">
            <div className="flex items-center gap-4">
              <div className="bg-info/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                <ArrowDownRight size={20} className="text-info" />
              </div>
              <div>
                <p className="text-sm font-bold text-text-primary">
                  {t('scheduledChangeToBefore')}{' '}
                  <span className="text-info">{subscription.pendingPlanChange}</span>
                </p>
                <p className="text-xs text-text-secondary">
                  {t('currentPlanActiveUntilBefore')}{' '}
                  {subscription.currentPeriodEnd
                    ? new Date(subscription.currentPeriodEnd).toLocaleDateString('es-MX', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        timeZone: 'UTC',
                      })
                    : t('endOfPeriod')}
                  {t('currentPlanActiveUntilAfter')}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowCancelDowngradeModal(true)}
              disabled={isCancellingDowngrade}
              className="bg-info/10 hover:bg-info/20 shrink-0 rounded-lg px-4 py-2 text-sm font-bold text-info-600 transition-colors disabled:opacity-50"
            >
              {isCancellingDowngrade ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  {t('canceling')}
                </span>
              ) : (
                t('cancelChange')
              )}
            </button>
          </div>
        )}

        {/* Main Pricing Grid */}
        <div className="space-y-8">
          <PlanGrid
            plans={(plansData || []).filter((plan) => {
              if (plan.type === SubscriptionPlan.ENTERPRISE) return false;
              if (
                subscription.plan !== SubscriptionPlan.FREE &&
                plan.type === SubscriptionPlan.FREE
              ) {
                return false;
              }
              return true;
            })}
            currentPlan={subscription.plan}
            onUpgrade={handlePlanSelect}
            upgradingPlan={upgradingPlan}
          />
        </div>

        {/* Cancel / Resume Subscription */}
        {subscription.plan !== SubscriptionPlan.FREE && (
          <div className="flex flex-col items-center gap-4 pt-4">
            <PermissionGuard permissions="billing:cancel_subscription">
              {subscription.cancelAtPeriodEnd ? (
                <>
                  <button
                    onClick={() => setShowResumeModal(true)}
                    className="border-success-500/20 bg-success-500/5 text-success-500/70 hover:bg-success-500/10 group flex items-center gap-2 rounded-xl border px-6 py-3 text-sm font-bold shadow-sm transition-all hover:border-success-500 hover:text-success-500"
                  >
                    {t('reactivate')}
                  </button>
                  <p className="text-[10px] font-medium uppercase tracking-widest text-text-tertiary">
                    {t('reactivateDesc')}
                  </p>
                </>
              ) : subscription.pendingPlanChange ? (
                <p className="text-warning-500/70 text-[10px] font-medium uppercase tracking-widest">
                  {t('cancelPendingFirst')}
                </p>
              ) : (
                <>
                  <button
                    onClick={handleCancelClick}
                    className="border-danger-500/20 bg-danger/5 text-danger/70 hover:bg-danger/10 group flex items-center gap-2 rounded-xl border px-6 py-3 text-sm font-bold shadow-sm transition-all hover:border-danger-500 hover:text-danger"
                  >
                    {t('cancelSubscription')}
                  </button>
                  <p className="text-[10px] font-medium uppercase tracking-widest text-text-tertiary">
                    {t('cancelNote')}
                  </p>
                </>
              )}
            </PermissionGuard>
          </div>
        )}

        {/* Confirm Plan Change Modal */}
        {selectedPlan && (
          <Modal
            isOpen={!!selectedPlan}
            onClose={() => setSelectedPlan(null)}
            title={isUpgrade ? t('confirmUpgradeTitle') : t('confirmChangeTitle')}
          >
            <div className="space-y-4">
              <p className="text-sm text-text-primary">
                {t('changeIntroBefore')}{' '}
                <strong className="text-text-primary">{selectedPlan.name}</strong> ($
                {selectedPlan.price.monthly}/{selectedPlan.price.currency}){t('changeIntroAfter')}
              </p>

              {isUpgrade ? (
                <div className="bg-info/10 rounded-lg p-4 text-sm text-info-600">
                  <p>
                    <strong>{t('immediateUpgrade')}</strong>
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-4">
                    <li>{t('immediateBullet1')}</li>
                    <li>{t('immediateBullet2')}</li>
                    <li>{t('immediateBullet3')}</li>
                  </ul>
                </div>
              ) : (
                <div className="bg-warning-500/10 rounded-lg p-4 text-sm text-warning-600">
                  <p>
                    <strong>{t('scheduledChange')}</strong>
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-4">
                    <li>{t('scheduledBullet1')}</li>
                    <li>{t('scheduledBullet2')}</li>
                    <li>{t('scheduledBullet3')}</li>
                  </ul>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => setSelectedPlan(null)}
                  className="rounded-xl px-4 py-2 text-sm font-bold text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
                >
                  {t('cancelButton')}
                </button>
                <button
                  onClick={confirmChange}
                  disabled={!!upgradingPlan}
                  className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-text-inverse hover:opacity-90 disabled:opacity-50"
                >
                  {upgradingPlan && <Loader2 size={16} className="animate-spin" />}
                  {isUpgrade ? t('confirmPay') : t('confirmChange')}
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* Advice Modal */}
        <Modal
          isOpen={showAdviceModal}
          onClose={() => setShowAdviceModal(false)}
          title={t('adviceTitle')}
        >
          <div className="space-y-4">
            <div className="bg-info/10 rounded-lg p-4 text-sm text-info-600">
              <p>{t('adviceText')}</p>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={handleProceedWithAdvice}
                className="rounded-xl px-4 py-2 text-sm font-bold text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
              >
                {t('proceedAnyway')}
              </button>
              <button
                onClick={() => router.push('/support?reason=upgrade')}
                className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-text-inverse hover:opacity-90"
              >
                {t('contactSupport')}
              </button>
            </div>
          </div>
        </Modal>

        {/* Cancel Subscription Modal */}
        <Modal
          isOpen={showCancelModal}
          onClose={() => setShowCancelModal(false)}
          title={t('cancelModalTitle')}
        >
          <div className="space-y-4">
            <div className="bg-danger/10 rounded-lg p-4 text-sm text-danger-600">
              <p className="mb-2 font-bold">{t('cancelConfirmHeading')}</p>
              <p>{t('cancelConfirmDesc')}</p>
            </div>

            <p className="text-xs text-text-secondary">
              {t('cancelAccessUntilBefore')}{' '}
              {subscription.currentPeriodEnd
                ? new Date(subscription.currentPeriodEnd).toLocaleDateString('es-MX', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    timeZone: 'UTC',
                  })
                : t('endOfPeriod')}
              {t('cancelNoRenewal')}
            </p>

            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={() => setShowCancelModal(false)}
                className="rounded-xl px-4 py-2 text-sm font-bold text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
              >
                {t('keepSubscription')}
              </button>
              <button
                onClick={confirmCancel}
                disabled={isCanceling}
                className="flex items-center gap-2 rounded-xl bg-danger px-4 py-2 text-sm font-bold text-brand-white hover:bg-danger-600 disabled:opacity-50"
              >
                {isCanceling && <Loader2 size={16} className="animate-spin" />}
                {t('cancelSubscriptionButton')}
              </button>
            </div>
          </div>
        </Modal>

        {/* Resume Subscription Modal */}
        <Modal
          isOpen={showResumeModal}
          onClose={() => setShowResumeModal(false)}
          title={t('reactivateModalTitle')}
        >
          <div className="space-y-4">
            <div className="bg-success-500/10 rounded-lg p-4 text-sm text-success-600">
              <p className="mb-2 font-bold">{t('reactivateConfirmHeading')}</p>
              <p>{t('reactivateConfirmDesc')}</p>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={() => setShowResumeModal(false)}
                className="rounded-xl px-4 py-2 text-sm font-bold text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
              >
                {t('cancelButton')}
              </button>
              <button
                onClick={confirmResume}
                disabled={isResuming}
                className="flex items-center gap-2 rounded-xl bg-success-500 px-4 py-2 text-sm font-bold text-brand-white hover:bg-success-600 disabled:opacity-50"
              >
                {isResuming && <Loader2 size={16} className="animate-spin" />}
                {t('reactivateButton')}
              </button>
            </div>
          </div>
        </Modal>

        {/* Cancel Downgrade Modal */}
        <Modal
          isOpen={showCancelDowngradeModal}
          onClose={() => !isCancellingDowngrade && setShowCancelDowngradeModal(false)}
          title={t('cancelDowngradeTitle')}
        >
          <div className="space-y-6">
            <p className="text-text-primary">
              {t('cancelDowngradeConfirmBefore')}{' '}
              <span className="font-bold">{subscription.pendingPlanChange}</span>?
            </p>

            <div className="border-info-500/20 bg-info/5 rounded-xl border p-4 text-sm text-info-600">
              {t('keepCurrentPlanBefore')} (<span className="font-bold">{subscription.plan}</span>){' '}
              {t('keepCurrentPlanAfter')}
            </div>

            <div className="flex w-full flex-col-reverse justify-end gap-3 sm:flex-row">
              <button
                onClick={() => setShowCancelDowngradeModal(false)}
                disabled={isCancellingDowngrade}
                className="rounded-xl px-4 py-2 text-sm font-bold text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
              >
                {t('closeButton')}
              </button>
              <button
                onClick={async () => {
                  await handleCancelDowngrade();
                  setShowCancelDowngradeModal(false);
                }}
                disabled={isCancellingDowngrade}
                className="flex items-center justify-center gap-2 rounded-xl bg-info px-4 py-2 text-sm font-bold text-brand-white transition-colors hover:bg-info-600 disabled:opacity-50"
              >
                {isCancellingDowngrade && <Loader2 size={16} className="animate-spin" />}
                {t('confirmCancellation')}
              </button>
            </div>
          </div>
        </Modal>

        {/* Plan Change Success Modal */}
        <Modal
          isOpen={showPlanChangeSuccess}
          onClose={() => setShowPlanChangeSuccess(false)}
          title=""
        >
          <div className="flex flex-col items-center space-y-6 py-4">
            <div className="bg-success-500/10 flex h-20 w-20 items-center justify-center rounded-full">
              <PartyPopper size={40} className="text-success-500" />
            </div>
            <div className="space-y-2 text-center">
              <h3 className="text-2xl font-bold text-text-primary">{t('planUpdatedHeading')}</h3>
              <p className="max-w-sm text-sm text-text-secondary">
                {t('planUpdatedTextBefore')} <strong>{changedPlanName}</strong>
                {t('planUpdatedTextAfter')}
              </p>
            </div>
            <button
              onClick={() => setShowPlanChangeSuccess(false)}
              className="rounded-xl bg-accent px-6 py-3 text-sm font-bold text-text-inverse transition-opacity hover:opacity-90"
            >
              {t('understoodButton')}
            </button>
          </div>
        </Modal>

        {/* Resume Success Modal */}
        <Modal isOpen={showResumeSuccess} onClose={() => setShowResumeSuccess(false)} title="">
          <div className="flex flex-col items-center space-y-6 py-4">
            <div className="bg-success-500/10 flex h-20 w-20 items-center justify-center rounded-full">
              <RefreshCw size={40} className="text-success-500" />
            </div>
            <div className="space-y-2 text-center">
              <h3 className="text-2xl font-bold text-text-primary">{t('resumeSuccessHeading')}</h3>
              <p className="max-w-sm text-sm text-text-secondary">{t('resumeSuccessText')}</p>
            </div>
            <button
              onClick={() => setShowResumeSuccess(false)}
              className="rounded-xl bg-accent px-6 py-3 text-sm font-bold text-text-inverse transition-opacity hover:opacity-90"
            >
              {t('continueButton')}
            </button>
          </div>
        </Modal>

        {/* Enterprise / Specialized Cards */}
        <div className="space-y-8 pt-6">
          <div className="space-y-3">
            <h2 className="text-3xl font-bold tracking-tight text-text-primary">
              {t('eliteServicesHeading')}
            </h2>
            <p className="max-w-xl font-medium text-text-secondary">{t('eliteServicesDesc')}</p>
          </div>
          <SpecializedCards />
        </div>

        {/* Info Sections */}
        <div className="pt-10">
          <InfoSections />
        </div>
      </div>
    </PermissionGuard>
  );
}
