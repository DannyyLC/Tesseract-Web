'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/identity/use-auth';
import {
  useBillingDashboard,
  useBillingMutations,
  usePlans,
  useSubscription,
} from '@/hooks/billing/use-billing';
import { SubscriptionPlan } from '@tesseract/types';
import BillingHero from './_components/billing-hero';
import OverageCard from './_components/overage-card';
import UsageCard from './_components/usage-card';
import Loading from '@/app/[locale]/(dashboard)/loading';
import { Workflow, Key, Users, ArrowUpRight, PartyPopper } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import PermissionGuard from '@/components/auth/permission-guard';
import { Modal } from '@/components/ui/modal';
import { toast } from 'sonner';
import { triggerWowConfetti } from '@/lib/confetti';

export default function BillingPage() {
  const t = useTranslations('Billing');
  const { isLoading: isLoadingAuth } = useAuth();
  const { data: dashboardData, isLoading } = useBillingDashboard();
  const { data: plans } = usePlans();
  useSubscription();
  const { createPortalSession } = useBillingMutations();

  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      setShowSuccessModal(true);
      triggerWowConfetti();
      window.history.replaceState(null, '', '/billing');
    } else if (searchParams.get('canceled') === 'true') {
      toast.error(t('cancelledPayment'));
      window.history.replaceState(null, '', '/billing');
    }
  }, [searchParams]);

  const fetchPortalUrl = async () => {
    if (portalUrl) return portalUrl;
    const { url } = await createPortalSession.mutateAsync();
    setPortalUrl(url);
    return url;
  };

  const handleOpenPortal = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (portalUrl) return; // Let the <a href> handle it naturally
    e.preventDefault();
    try {
      setIsOpeningPortal(true);
      const url = await fetchPortalUrl();
      window.open(url, '_blank');
    } finally {
      setIsOpeningPortal(false);
    }
  };

  if (isLoading || isLoadingAuth) {
    return <Loading />;
  }

  // Safe defaults
  const credits = dashboardData?.credits || { available: 0, usedThisMonth: 0, limit: 0 };
  const usage = dashboardData?.usage || {
    workflows: { used: 0, limit: 0 },
    apiKeys: { used: 0, limit: 0 },
    users: { used: 0, limit: 0 },
  };

  const subscription = {
    plan: dashboardData?.plan || SubscriptionPlan.FREE,
    status: dashboardData?.status,
    currentPeriodEnd: dashboardData?.nextBillingDate || null,
    cancelAtPeriodEnd: dashboardData?.cancelAtPeriodEnd || false,
  };

  const currentPlan = plans?.find((p) => p.type === subscription.plan);
  const maxOverageLimit = currentPlan?.limits.overageLimit || 0;
  const currentOverageLimit = dashboardData?.overageLimit ?? 0;
  const isPaidPlan = subscription.plan !== SubscriptionPlan.FREE;

  return (
    <>
      <PermissionGuard permissions="billing:read" redirect={true} fallbackRoute="/dashboard">
        <div className="space-y-10 pb-20">
          {/* Header */}
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div className="space-y-2">
              <h1 className="text-4xl font-bold tracking-tight text-text-primary">
                {t('heading')}
              </h1>
              <p className="max-w-sm font-medium text-text-secondary">{t('description')}</p>
            </div>
            <div className="flex gap-3">
              <PermissionGuard permissions="billing:checkout">
                {dashboardData?.hasBillingAccount && (
                  <a
                    href={portalUrl || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={handleOpenPortal}
                    onMouseEnter={() => fetchPortalUrl()}
                    className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-secondary"
                  >
                    {isOpeningPortal ? t('loading') : t('paymentPortal')}
                  </a>
                )}
              </PermissionGuard>
              <Link
                href="/billing/plans"
                className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-text-inverse transition-opacity hover:opacity-90"
              >
                {t('managePlan')}
                <ArrowUpRight size={16} />
              </Link>
            </div>
          </div>

          {/* Hero: Unified Billing Stats */}
          <BillingHero
            plan={subscription.plan}
            status={subscription.status || 'unknown'}
            nextBillingDate={subscription.currentPeriodEnd}
            credits={credits}
            cancelAtPeriodEnd={subscription.cancelAtPeriodEnd}
            pendingPlanChange={dashboardData?.pendingPlanChange}
          />

          {/* Overage Configuration — only for paid plans */}
          {isPaidPlan && (
            <OverageCard
              allowOverages={dashboardData?.allowOverages || false}
              maxOverageLimit={maxOverageLimit}
              currentOverageLimit={currentOverageLimit}
            />
          )}

          {/* Resource Usage Grid */}
          <div>
            <h2 className="mb-6 text-xl font-bold text-text-primary">{t('resourceUsage')}</h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <UsageCard
                title={t('workflowsTitle')}
                icon={<Workflow />}
                used={usage.workflows.used}
                limit={usage.workflows.limit}
                unit={t('workflowsUnit')}
              />
              <UsageCard
                title={t('apiKeysTitle')}
                icon={<Key />}
                used={usage.apiKeys.used}
                limit={usage.apiKeys.limit}
                unit={t('keysUnit')}
              />
              <UsageCard
                title={t('usersTitle')}
                icon={<Users />}
                used={usage.users.used}
                limit={usage.users.limit}
                unit={t('usersUnit')}
              />
            </div>
          </div>
        </div>
      </PermissionGuard>

      {/* Success Modal after Checkout */}
      <Modal isOpen={showSuccessModal} onClose={() => setShowSuccessModal(false)} title="">
        <div className="flex flex-col items-center space-y-6 py-4">
          <div className="bg-success-500/10 flex h-20 w-20 items-center justify-center rounded-full">
            <PartyPopper size={40} className="text-success-500" />
          </div>
          <div className="space-y-2 text-center">
            <h3 className="text-2xl font-bold text-text-primary">{t('successHeading')}</h3>
            <p className="max-w-sm text-sm text-text-secondary">{t('successText')}</p>
          </div>
          <button
            onClick={() => setShowSuccessModal(false)}
            className="rounded-xl bg-accent px-6 py-3 text-sm font-bold text-text-inverse transition-opacity hover:opacity-90"
          >
            {t('startButton')}
          </button>
        </div>
      </Modal>
    </>
  );
}
