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

export default function PlansPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

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
        toast.success('Cambio de plan programado cancelado exitosamente');
        setIsCancellingDowngrade(false);
      },
      onError: (error: any) => {
        let msg = 'Error al cancelar el cambio de plan';
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

      // Si hay un pago pendiente (pago fallido / incomplete en Stripe), redirigir al Portal
      // para que el usuario actualice su método de pago. Stripe reintentará el cobro automáticamente.
      if (subStatus === 'PAST_DUE') {
        const { url } = await createPortalSession.mutateAsync();
        goToStripe(url);
        return;
      }

      const isFreeOrCanceled = planState === SubscriptionPlan.FREE || subStatus === 'CANCELED';

      if (isFreeOrCanceled) {
        // Redirigir al Checkout si estaban en FREE o CANCELED
        const { url } = await createCheckoutSession.mutateAsync(selectedPlan.type);
        goToStripe(url);
      } else {
        try {
          // Intentar actualizar la suscripción existente
          await updateSubscription.mutateAsync(selectedPlan.type as SubscriptionPlan);
          setChangedPlanName(selectedPlan.name);
          setShowPlanChangeSuccess(true);
          triggerWowConfetti();
        } catch (updateError: any) {
          // Si el backend detectó que la suscripción está cancelada en Stripe (409 Conflict),
          // auto-recuperarse: crear una nueva suscripción via Checkout
          if (updateError?.response?.status === 409) {
            const { url } = await createCheckoutSession.mutateAsync(selectedPlan.type);
            goToStripe(url);
            return;
          }
          // Si hay un pago pendiente (PAST_DUE), redirigir al Portal para actualizar método de pago.
          // Stripe reintentará el cobro automáticamente al actualizar la tarjeta.
          if (updateError?.response?.data?.message === 'SUBSCRIPTION_PAST_DUE') {
            const { url } = await createPortalSession.mutateAsync();
            goToStripe(url);
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
      toast.success(
        'Tu suscripción ha sido cancelada. Seguirás disfrutando de tus beneficios hasta el final del periodo.',
      );
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
            Atrás
          </button>
        </div>

        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-text-primary">
            Planes de Suscripción
          </h1>
          <p className="max-w-xl font-medium text-text-secondary">
            Administra tu plan actual, actualiza tu suscripción o cancela el servicio.
          </p>
        </div>

        {/* Past Due / Failed Payment Banner */}
        {subscription.status?.toUpperCase() === 'PAST_DUE' && (
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-danger-500/20 bg-danger/5 p-5">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger/10">
                <AlertCircle size={20} className="text-danger" />
              </div>
              <div>
                <p className="text-sm font-bold text-text-primary">Pago pendiente</p>
                <p className="text-xs text-text-secondary">
                  Tu último pago no fue procesado. Actualiza tu método de pago para activar tu
                  suscripción.
                </p>
              </div>
            </div>
            <button
              onClick={async () => {
                const { url } = await createPortalSession.mutateAsync();
                goToStripe(url);
              }}
              className="shrink-0 rounded-lg bg-danger/10 px-4 py-2 text-sm font-bold text-danger-600 transition-colors hover:bg-danger/20"
            >
              Actualizar Pago
            </button>
          </div>
        )}

        {/* Pending Plan Change Banner */}
        {subscription.pendingPlanChange && (
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-info-500/20 bg-info/5 p-5">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-info/10">
                <ArrowDownRight size={20} className="text-info" />
              </div>
              <div>
                <p className="text-sm font-bold text-text-primary">
                  Cambio programado a{' '}
                  <span className="text-info">{subscription.pendingPlanChange}</span>
                </p>
                <p className="text-xs text-text-secondary">
                  Tu plan actual seguirá activo hasta el{' '}
                  {subscription.currentPeriodEnd
                    ? new Date(subscription.currentPeriodEnd).toLocaleDateString('es-MX', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        timeZone: 'UTC',
                      })
                    : 'final del periodo'}
                  . Después cambiará automáticamente.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowCancelDowngradeModal(true)}
              disabled={isCancellingDowngrade}
              className="shrink-0 rounded-lg bg-info/10 px-4 py-2 text-sm font-bold text-info-600 transition-colors hover:bg-info/20 disabled:opacity-50"
            >
              {isCancellingDowngrade ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  Cancelando...
                </span>
              ) : (
                'Cancelar Cambio'
              )}
            </button>
          </div>
        )}

        {/* Main Pricing Grid */}
        <div className="space-y-8">
          <PlanGrid
            plans={(plansData || []).filter((plan) => {
              // Enterprise is always handled separately
              if (plan.type === SubscriptionPlan.ENTERPRISE) return false;

              // If user has an active paid subscription, hide the FREE plan from the grid
              // They should use the "Cancel Subscription" button instead
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
                    className="group flex items-center gap-2 rounded-xl border border-success-500/20 bg-success-500/5 px-6 py-3 text-sm font-bold text-success-500/70 shadow-sm transition-all hover:border-success-500 hover:bg-success-500/10 hover:text-success-500"
                  >
                    Reactivar Suscripción
                  </button>
                  <p className="text-[10px] font-medium uppercase tracking-widest text-text-tertiary">
                    Tu suscripción está programada para cancelarse. Puedes reactivarla antes de que
                    termine el periodo.
                  </p>
                </>
              ) : subscription.pendingPlanChange ? (
                <p className="text-[10px] font-medium uppercase tracking-widest text-warning-500/70">
                  Cancela el cambio pendiente antes de cancelar la suscripción
                </p>
              ) : (
                <>
                  <button
                    onClick={handleCancelClick}
                    className="group flex items-center gap-2 rounded-xl border border-danger-500/20 bg-danger/5 px-6 py-3 text-sm font-bold text-danger/70 shadow-sm transition-all hover:border-danger-500 hover:bg-danger/10 hover:text-danger"
                  >
                    Cancelar suscripción actual
                  </button>
                  <p className="text-[10px] font-medium uppercase tracking-widest text-text-tertiary">
                    Al cancelar, mantendrás tus beneficios hasta el final del periodo
                  </p>
                </>
              )}
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
              <p className="text-sm text-text-primary">
                Estás a punto de cambiar tu suscripción al plan{' '}
                <strong className="text-text-primary">{selectedPlan.name}</strong> ($
                {selectedPlan.price.monthly}/{selectedPlan.price.currency}).
              </p>

              {isUpgrade ? (
                <div className="rounded-lg bg-info/10 p-4 text-sm text-info-600">
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
                <div className="rounded-lg bg-warning-500/10 p-4 text-sm text-warning-600">
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
                  className="rounded-xl px-4 py-2 text-sm font-bold text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmChange}
                  disabled={!!upgradingPlan}
                  className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-text-inverse hover:opacity-90 disabled:opacity-50"
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
            <div className="rounded-lg bg-info/10 p-4 text-sm text-info-600">
              <p>
                Te sugerimos que antes de contratar el plan te comuniques con nosotros para crear
                tus workflows, porque actualmente no podrías aprovechar todos los beneficios de la
                suscripción.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={handleProceedWithAdvice}
                className="rounded-xl px-4 py-2 text-sm font-bold text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
              >
                Continuar de todos modos
              </button>
              <button
                onClick={() => router.push('/support?reason=upgrade')}
                className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-text-inverse hover:opacity-90"
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
            <div className="rounded-lg bg-danger/10 p-4 text-sm text-danger-600">
              <p className="mb-2 font-bold">¿Estás seguro de que deseas cancelar?</p>
              <p>
                Perderás acceso a tus beneficios premium al finalizar el periodo de facturación
                actual.
              </p>
            </div>

            <p className="text-xs text-text-secondary">
              Si cancelas ahora, tu acceso continuará hasta el{' '}
              {subscription.currentPeriodEnd
                ? new Date(subscription.currentPeriodEnd).toLocaleDateString('es-MX', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    timeZone: 'UTC',
                  })
                : 'final del periodo'}
              , pero no se renovará automáticamente.
            </p>

            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={() => setShowCancelModal(false)}
                className="rounded-xl px-4 py-2 text-sm font-bold text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
              >
                Mantener Suscripción
              </button>
              <button
                onClick={confirmCancel}
                disabled={isCanceling}
                className="flex items-center gap-2 rounded-xl bg-danger px-4 py-2 text-sm font-bold text-brand-white hover:bg-danger-600 disabled:opacity-50"
              >
                {isCanceling && <Loader2 size={16} className="animate-spin" />}
                Cancelar Suscripción
              </button>
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={showResumeModal}
          onClose={() => setShowResumeModal(false)}
          title="Reactivar Suscripción"
        >
          <div className="space-y-4">
            <div className="rounded-lg bg-success-500/10 p-4 text-sm text-success-600">
              <p className="mb-2 font-bold">¿Deseas reactivar tu suscripción?</p>
              <p>
                Tu suscripción continuará normalmente y se renovará automáticamente al finalizar el
                periodo de facturación actual.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={() => setShowResumeModal(false)}
                className="rounded-xl px-4 py-2 text-sm font-bold text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
              >
                Cancelar
              </button>
              <button
                onClick={confirmResume}
                disabled={isResuming}
                className="flex items-center gap-2 rounded-xl bg-success-500 px-4 py-2 text-sm font-bold text-brand-white hover:bg-success-600 disabled:opacity-50"
              >
                {isResuming && <Loader2 size={16} className="animate-spin" />}
                Reactivar Suscripción
              </button>
            </div>
          </div>
        </Modal>

        {/* Cancel Downgrade Confirmation Modal */}
        <Modal
          isOpen={showCancelDowngradeModal}
          onClose={() => !isCancellingDowngrade && setShowCancelDowngradeModal(false)}
          title="Cancelar Cambio Programado"
        >
          <div className="space-y-6">
            <p className="text-text-primary">
              ¿Estás seguro de que deseas cancelar el cambio programado a{' '}
              <span className="font-bold">{subscription.pendingPlanChange}</span>?
            </p>

            <div className="rounded-xl border border-info-500/20 bg-info/5 p-4 text-sm text-info-600">
              Mantendrás tu plan actual (<span className="font-bold">{subscription.plan}</span>) de
              forma continua y no habrá interrupciones en tu servicio.
            </div>

            <div className="flex w-full flex-col-reverse justify-end gap-3 sm:flex-row">
              <button
                onClick={() => setShowCancelDowngradeModal(false)}
                disabled={isCancellingDowngrade}
                className="rounded-xl px-4 py-2 text-sm font-bold text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
              >
                Cerrar
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
                Confirmar Cancelación
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
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success-500/10">
              <PartyPopper size={40} className="text-success-500" />
            </div>
            <div className="space-y-2 text-center">
              <h3 className="text-2xl font-bold text-text-primary">¡Plan actualizado!</h3>
              <p className="max-w-sm text-sm text-text-secondary">
                Tu suscripción ha sido actualizada al plan <strong>{changedPlanName}</strong>.
                Gracias por tu confianza. Los cambios pueden tardar unos segundos en reflejarse.
              </p>
            </div>
            <button
              onClick={() => setShowPlanChangeSuccess(false)}
              className="rounded-xl bg-accent px-6 py-3 text-sm font-bold text-text-inverse transition-opacity hover:opacity-90"
            >
              ¡Entendido!
            </button>
          </div>
        </Modal>

        {/* Resume Success Modal */}
        <Modal isOpen={showResumeSuccess} onClose={() => setShowResumeSuccess(false)} title="">
          <div className="flex flex-col items-center space-y-6 py-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success-500/10">
              <RefreshCw size={40} className="text-success-500" />
            </div>
            <div className="space-y-2 text-center">
              <h3 className="text-2xl font-bold text-text-primary">
                ¡Bienvenido de vuelta!
              </h3>
              <p className="max-w-sm text-sm text-text-secondary">
                Tu suscripción ha sido reactivada exitosamente. Seguirás disfrutando de todos tus
                beneficios sin interrupción.
              </p>
            </div>
            <button
              onClick={() => setShowResumeSuccess(false)}
              className="rounded-xl bg-accent px-6 py-3 text-sm font-bold text-text-inverse transition-opacity hover:opacity-90"
            >
              ¡Continuar!
            </button>
          </div>
        </Modal>

        {/* Enterprise / Specialized Cards */}
        <div className="space-y-8 pt-6">
          <div className="space-y-3">
            <h2 className="text-3xl font-bold tracking-tight text-text-primary">
              Servicios de Élite
            </h2>
            <p className="max-w-xl font-medium text-text-secondary">
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
