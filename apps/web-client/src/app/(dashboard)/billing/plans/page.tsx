'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBillingDashboard, useBillingMutations } from '@/hooks/useBilling';
import { usePlans } from '@/hooks/useBilling';
import { useWorkflowStats } from '@/hooks/useWorkflows';
import { SubscriptionPlan, BillingPlan } from '@tesseract/types';
import PlanGrid from '../_components/PlanGrid';
import InfoSections from '../_components/InfoSections';
import SpecializedCards from '../_components/SpecializedCards';
import { Modal } from '@/components/ui/modal';
import { Loader2, ArrowLeft } from 'lucide-react';
import Loading from '@/app/(dashboard)/loading';
import PermissionGuard from '@/components/auth/PermissionGuard';

export default function PlansPage() {
  const router = useRouter();
  const { data: dashboardData, isLoading: isLoadingDashboard } = useBillingDashboard();
  const { data: plansData, isLoading: isLoadingPlans } = usePlans();
  const { data: workflowStats } = useWorkflowStats();
  const { updateSubscription, cancelSubscription, createCheckoutSession } = useBillingMutations();

  const [selectedPlan, setSelectedPlan] = useState<BillingPlan | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showAdviceModal, setShowAdviceModal] = useState(false);
  const [pendingPlanType, setPendingPlanType] = useState<string | null>(null);
  const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null);
  const [isCanceling, setIsCanceling] = useState(false);

  // Derive subscription state
  const subscription = {
    plan: dashboardData?.plan || SubscriptionPlan.FREE,
    status: dashboardData?.status,
    currentPeriodEnd: dashboardData?.nextBillingDate,
    cancelAtPeriodEnd: dashboardData?.cancelAtPeriodEnd,
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
      
      const isFreeOrCanceled =
        planState === SubscriptionPlan.FREE || subStatus === 'CANCELED';

      if (isFreeOrCanceled) {
        // Redirigir al Checkout si estaban en FREE o CANCELED
        const { url } = await createCheckoutSession.mutateAsync(selectedPlan.type);
        window.location.href = url;
      } else {
        try {
          // Intentar actualizar la suscripción existente
          await updateSubscription.mutateAsync(selectedPlan.type as SubscriptionPlan);
        } catch (updateError: any) {
          // Si el backend detectó que la suscripción está cancelada en Stripe (409 Conflict),
          // auto-recuperarse: crear una nueva suscripción via Checkout
          if (updateError?.response?.status === 409) {
            const { url } = await createCheckoutSession.mutateAsync(selectedPlan.type);
            window.location.href = url;
            return;
          }
          // Cualquier otro error, re-lanzar
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
    } finally {
      setIsCanceling(false);
      setShowCancelModal(false);
    }
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
          className="group flex items-center gap-2 text-sm font-medium text-black/50 transition-colors hover:text-black dark:text-white/50 dark:hover:text-white"
        >
          <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-1" />
          Atrás
        </button>
      </div>

      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-4xl font-bold tracking-tight text-black dark:text-white">
          Planes de Suscripción
        </h1>
        <p className="max-w-xl font-medium text-black/50 dark:text-white/50">
          Administra tu plan actual, actualiza tu suscripción o cancela el servicio.
        </p>
      </div>

      {/* Main Pricing Grid */}
      <div className="space-y-8">
        <PlanGrid
          plans={(plansData || []).filter((plan) => {
            // Enterprise is always handled separately
            if (plan.type === SubscriptionPlan.ENTERPRISE) return false;
            
            // If user has an active paid subscription, hide the FREE plan from the grid
            // They should use the "Cancel Subscription" button instead
            if (subscription.plan !== SubscriptionPlan.FREE && plan.type === SubscriptionPlan.FREE) {
              return false;
            }
            
            return true;
          })}
          currentPlan={subscription.plan}
          onUpgrade={handlePlanSelect}
          upgradingPlan={upgradingPlan}
        />
      </div>

      {/* Cancel Subscription */}
      {subscription.plan !== SubscriptionPlan.FREE && (
        <div className="flex flex-col items-center gap-4 pt-4">
          <PermissionGuard permissions="billing:cancel_subscription">
            <button
              onClick={handleCancelClick}
              disabled={subscription.cancelAtPeriodEnd}
              className="group flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-6 py-3 text-sm font-bold text-red-500/70 shadow-sm transition-all hover:border-red-500 hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
            >
              {subscription.cancelAtPeriodEnd
                ? 'Cancelación Programada'
                : 'Cancelar suscripción actual'}
            </button>
            <p className="text-[10px] font-medium uppercase tracking-widest text-black/30 dark:text-white/30">
              Al cancelar, mantendrás tus beneficios hasta el final del periodo
            </p>
          </PermissionGuard>
        </div>
      )}

      {/* Modals */}
      {selectedPlan && (
        <Modal
          isOpen={!!selectedPlan}
          onClose={() => setSelectedPlan(null)}
          title={isUpgrade ? 'Confirmar Actualización' : 'Confirmar Cambio de Plan'}
        >
          <div className="space-y-4">
            <p className="text-sm text-black/70 dark:text-white/70">
              Estás a punto de cambiar tu suscripción al plan{' '}
              <strong className="text-black dark:text-white">{selectedPlan.name}</strong> ($
              {selectedPlan.price.monthly}/{selectedPlan.price.currency}).
            </p>

            {isUpgrade ? (
              <div className="rounded-lg bg-blue-500/10 p-4 text-sm text-blue-600 dark:text-blue-400">
                <p>
                  <strong>Actualización Inmediata:</strong>
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  <li>Se cobrará el total de la nueva suscripción ahora.</li>
                  <li>Los nuevos créditos se sumarán a tu balance actual.</li>
                  <li>Tu fecha de facturación se reiniciará al día de hoy.</li>
                </ul>
              </div>
            ) : (
              <div className="rounded-lg bg-amber-500/10 p-4 text-sm text-amber-600 dark:text-amber-400">
                <p>
                  <strong>Cambio Programado:</strong>
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  <li>Tu plan actual seguirá activo hasta el final del periodo.</li>
                  <li>El nuevo precio se cobrará en tu próxima fecha de renovación.</li>
                  <li>Disfrutarás de los beneficios actuales hasta entonces.</li>
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={() => setSelectedPlan(null)}
                className="rounded-xl px-4 py-2 text-sm font-bold text-black/50 hover:bg-black/5 hover:text-black dark:text-white/50 dark:hover:bg-white/5 dark:hover:text-white"
              >
                Cancelar
              </button>
              <button
                onClick={confirmChange}
                disabled={!!upgradingPlan}
                className="flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-black"
              >
                {upgradingPlan && <Loader2 size={16} className="animate-spin" />}
                {isUpgrade ? 'Confirmar y Pagar' : 'Confirmar Cambio'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      <Modal
        isOpen={showAdviceModal}
        onClose={() => setShowAdviceModal(false)}
        title="Sugerencia antes de contratar"
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-blue-500/10 p-4 text-sm text-blue-600 dark:text-blue-400">
            <p>
              Te sugiero que antes de contratar el plan te comuniques con nosotros para crear tus
              workflows, porque actualmente no podrías aprovechar todos los beneficios de la
              suscripción.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={handleProceedWithAdvice}
              className="rounded-xl px-4 py-2 text-sm font-bold text-black/50 hover:bg-black/5 hover:text-black dark:text-white/50 dark:hover:bg-white/5 dark:hover:text-white"
            >
              Continuar de todos modos
            </button>
            <button
              onClick={() => router.push('/support?reason=upgrade')}
              className="flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-sm font-bold text-white hover:opacity-90 dark:bg-white dark:text-black"
            >
              Contactar Soporte
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        title="Cancelar Suscripción"
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">
            <p className="mb-2 font-bold">¿Estás seguro de que deseas cancelar?</p>
            <p>
              Perderás acceso a tus beneficios premium al finalizar el periodo de facturación
              actual.
            </p>
          </div>

          <p className="text-xs text-black/50 dark:text-white/50">
            Si cancelas ahora, tu acceso continuará hasta el{' '}
            {subscription.currentPeriodEnd
              ? new Date(subscription.currentPeriodEnd).toLocaleDateString('es-MX', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })
              : 'final del periodo'}
            , pero no se renovará automáticamente.
          </p>

          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={() => setShowCancelModal(false)}
              className="rounded-xl px-4 py-2 text-sm font-bold text-black/50 hover:bg-black/5 hover:text-black dark:text-white/50 dark:hover:bg-white/5 dark:hover:text-white"
            >
              Mantener Suscripción
            </button>
            <button
              onClick={confirmCancel}
              disabled={isCanceling}
              className="flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-50"
            >
              {isCanceling && <Loader2 size={16} className="animate-spin" />}
              Cancelar Suscripción
            </button>
          </div>
        </div>
      </Modal>

      {/* Enterprise / Specialized Cards */}
      <div className="space-y-8 pt-6">
        <div className="space-y-3">
          <h2 className="text-3xl font-bold tracking-tight text-black dark:text-white">
            Servicios de Élite
          </h2>
          <p className="max-w-xl font-medium text-black/50 dark:text-white/50">
            Capacidad ilimitada y acompañamiento experto para escalar tu transformación digital.
          </p>
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
