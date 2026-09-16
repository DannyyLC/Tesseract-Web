'use client';

import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useBillingDashboard, useBillingMutations } from '@/hooks/billing/use-billing';
import PermissionGuard from '@/components/auth/permission-guard';

/**
 * Aviso de pago vencido, visible fuera de /billing.
 *
 * Antes de esto, un cliente con `PAST_DUE` solo se enteraba entrando a Billing por su cuenta —
 * el badge y el banner existentes viven ahí. Con el gate de suscripción activa bloqueando la
 * ejecución tras la gracia, un aviso que solo aparece donde nadie vive equivale a no avisar.
 * Mismo patrón que `BrokenIntegrationsBanner`: desaparece por completo si todo está al corriente.
 */
export function PastDuePaymentBanner() {
  const t = useTranslations('Billing');
  const { data } = useBillingDashboard();
  const { createPortalSession } = useBillingMutations();

  if (data?.status?.toUpperCase() !== 'PAST_DUE') return null;

  const handleUpdatePayment = async () => {
    const { url } = await createPortalSession.mutateAsync();
    window.open(url, '_blank');
  };

  return (
    <PermissionGuard permissions="billing:read">
      <div className="flex items-start gap-3 rounded-xl border border-[var(--danger-banner-border)] bg-[var(--danger-banner-bg)] p-4">
        <AlertTriangle
          size={18}
          className="mt-0.5 flex-shrink-0 text-[var(--danger-text-adaptive)]"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--badge-danger-text-solid)]">
            {t('pastDueBannerTitle')}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--danger-text-adaptive)]">
            {t('pastDueBannerDesc')}
          </p>
        </div>
        <button
          onClick={handleUpdatePayment}
          className="flex-shrink-0 self-center text-xs font-medium text-[var(--danger-text-adaptive)] hover:underline"
        >
          {t('pastDueBannerCta')}
        </button>
      </div>
    </PermissionGuard>
  );
}
