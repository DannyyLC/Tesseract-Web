'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

import { useAuth } from '@/hooks/useAuth';
import {
  useBillingDashboard,
  useBillingMutations,
  usePlans,
  useSubscription,
} from '@/hooks/useBilling';
import { SubscriptionPlan } from '@tesseract/types';
import BillingHero from './_components/BillingHero';
import OverageCard from './_components/OverageCard';
import UsageCard from './_components/UsageCard';
import Loading from '@/app/(dashboard)/loading';
import { Workflow, Key, Users, ArrowUpRight, PartyPopper } from 'lucide-react';
import Link from 'next/link';
import PermissionGuard from '@/components/auth/PermissionGuard';
import { Modal } from '@/components/ui/modal';
import { toast } from 'sonner';

export default function BillingPage() {
  const { isLoading: isLoadingAuth } = useAuth();
  const { data: dashboardData, isLoading } = useBillingDashboard();
  const { data: plans } = usePlans();
  const { data: subscriptionDetails } = useSubscription();
  const { createPortalSession } = useBillingMutations();

  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      setShowSuccessModal(true);
      // Clean URL params without reload
      router.replace('/billing', { scroll: false });
    } else if (searchParams.get('canceled') === 'true') {
      toast.error('El proceso de pago fue cancelado.');
      router.replace('/billing', { scroll: false });
    }
  }, [searchParams, router]);

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
            <h1 className="text-4xl font-bold tracking-tight text-black dark:text-white">
              Resumen de Facturación
            </h1>
            <p className="max-w-sm font-medium text-black/50 dark:text-white/50">
              Monitorea tu consumo y el estado de tu suscripción.
            </p>
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
                  className="flex items-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-medium text-black hover:bg-black/5 dark:border-white/10 dark:bg-transparent dark:text-white dark:hover:bg-white/5"
                >
                  {isOpeningPortal ? 'Cargando...' : 'Portal de Pagos'}
                </a>
              )}
            </PermissionGuard>
            <Link
              href="/billing/plans"
              className="flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-black"
            >
              Gestionar Plan
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
          <h2 className="mb-6 text-xl font-bold text-black dark:text-white">Uso de Recursos</h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <UsageCard
              title="Workflows Activos"
              icon={<Workflow />}
              used={usage.workflows.used}
              limit={usage.workflows.limit}
              unit="workflows"
            />
            <UsageCard
              title="API Keys"
              icon={<Key />}
              used={usage.apiKeys.used}
              limit={usage.apiKeys.limit}
              unit="keys"
            />
            <UsageCard
              title="Usuarios"
              icon={<Users />}
              used={usage.users.used}
              limit={usage.users.limit}
              unit="usuarios"
            />
          </div>
        </div>
      </div>
    </PermissionGuard>

      {/* Success Modal after Checkout */}
      <Modal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        title=""
      >
        <div className="flex flex-col items-center space-y-6 py-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10">
            <PartyPopper size={40} className="text-emerald-500" />
          </div>
          <div className="space-y-2 text-center">
            <h3 className="text-2xl font-bold text-black dark:text-white">
              ¡Gracias por tu confianza!
            </h3>
            <p className="max-w-sm text-sm text-black/60 dark:text-white/60">
              Tu suscripción ha sido activada exitosamente. Ya puedes disfrutar
              de todos los beneficios de tu nuevo plan.
            </p>
          </div>
          <button
            onClick={() => setShowSuccessModal(false)}
            className="rounded-xl bg-black px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-black"
          >
            ¡Comenzar!
          </button>
        </div>
      </Modal>
    </>
  );
}
