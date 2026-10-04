'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useLocale, useTranslations } from 'next-intl';
import {
  AlertTriangle,
  CalendarClock,
  CalendarPlus,
  Gauge,
  Loader2,
  Power,
  PowerOff,
  Receipt,
} from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { useAdminOrganizationMutations } from '@/hooks/identity/use-admin-organizations';
import { useApiErrorMessage } from '@/hooks/shared/use-api-error-message';
import { toIntlLocale } from '@/lib/intl-locale';
import type { AdminOrganizationDetail } from '@/lib/api/endpoints/identity/organizations/organizations-admin-api';
import {
  btnDanger,
  btnDangerGhost,
  btnGhost,
  inputClass,
  labelClass,
} from '@/app/[locale]/admin/_styles';
import { isToastHandled } from '@/lib/api/api-error';
import {
  CreditsCard,
  LEVEL_COLOR,
  Meter,
  StatCard,
  UsageGrid,
  daysUntil,
  planColor,
  usageLevel,
} from './org-visuals';

interface Props {
  org: AdminOrganizationDetail;
}

/** Color del estado de la suscripción: solo ACTIVE es sano; el resto pide atención. */
const factLabelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';

const SUBSCRIPTION_STATUS_COLOR: Record<string, string> = {
  ACTIVE: 'var(--success-500)',
  PAST_DUE: 'var(--warning-500)',
  INCOMPLETE: 'var(--warning-500)',
  CANCELED: 'var(--danger-500)',
};

export function GeneralTab({ org }: Props) {
  const t = useTranslations('Admin.GeneralTab');
  const intlLocale = toIntlLocale(useLocale());
  const getApiErrorMessage = useApiErrorMessage();
  const { deactivate, reactivate } = useAdminOrganizationMutations();
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [reason, setReason] = useState('');

  const closeDeactivate = () => {
    setIsDeactivating(false);
    setConfirmName('');
    setReason('');
  };

  // Sin espacios en el borde -copiar y pegar el nombre suele arrastrarlos- pero
  // respetando mayúsculas y acentos: es una confirmación, no una búsqueda.
  const canDeactivate = confirmName.trim() === org.name.trim();

  const handleDeactivate = () => {
    if (!canDeactivate) return;
    deactivate.mutate(
      { id: org.id, reason: reason.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(t('deactivateSuccess'));
          closeDeactivate();
        },
        onError: (e) => !isToastHandled(e) && toast.error(getApiErrorMessage(e)),
      },
    );
  };

  const handleReactivate = () => {
    reactivate.mutate(org.id, {
      onSuccess: () => toast.success(t('reactivateSuccess')),
      onError: (e) => !isToastHandled(e) && toast.error(getApiErrorMessage(e)),
    });
  };

  const num = (value: number) => value.toLocaleString(intlLocale);
  const date = (value: string) =>
    new Date(value).toLocaleDateString(intlLocale, { dateStyle: 'medium' });
  const ageDays = Math.floor((Date.now() - new Date(org.createdAt).getTime()) / 86_400_000);

  const subscription = org.subscription;
  const periodStart = subscription ? new Date(subscription.currentPeriodStart).getTime() : 0;
  const periodEnd = subscription ? new Date(subscription.currentPeriodEnd).getTime() : 0;
  const periodRatio =
    subscription && periodEnd > periodStart
      ? (Date.now() - periodStart) / (periodEnd - periodStart)
      : 0;
  const statusColor = subscription
    ? (SUBSCRIPTION_STATUS_COLOR[subscription.status] ?? 'var(--chart-axis)')
    : 'var(--chart-axis)';

  // El override de la organización manda sobre el del plan; -1 es ilimitado.
  const overageLimit = org.overageLimit ?? org.planLimits.limits.overageLimit;
  const overageUsed = org.usage.credits < 0 ? -org.usage.credits : 0;
  const overageRatio = overageLimit > 0 ? overageUsed / overageLimit : 0;

  const statusTextColor = org.isActive ? 'var(--success-500)' : 'var(--danger-500)';

  return (
    <div className="w-full space-y-6">
      {/* ─── Resumen ───────────────────────────────────────────────────────── */}
      {/* Nombre y slug ya están en el encabezado fijo de la página: aquí no se repiten. */}
      <section className="rounded-2xl border border-border p-6">
        <dl className="grid grid-cols-2 gap-6 md:grid-cols-4">
          <div>
            <dt className={factLabelClass}>{t('statusLabel')}</dt>
            <dd
              className="mt-2 inline-flex items-center gap-2 text-xl font-semibold"
              style={{ color: statusTextColor }}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: statusTextColor }} />
              {org.isActive ? t('active') : t('inactive')}
            </dd>
          </div>
          <div className="md:border-l md:border-[var(--border-subtle)] md:pl-6">
            <dt className={factLabelClass}>{t('plan')}</dt>
            <dd
              className="mt-2 text-xl font-semibold tracking-wide"
              style={{ color: planColor(org.plan) }}
            >
              {org.plan}
            </dd>
          </div>
          <div className="md:border-l md:border-[var(--border-subtle)] md:pl-6">
            <dt className={factLabelClass}>{t('created')}</dt>
            <dd className="mt-2 text-xl font-semibold text-text-primary">{date(org.createdAt)}</dd>
            <dd className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-text-tertiary">
              <CalendarPlus size={12} />
              {t('ageDays', { days: ageDays })}
            </dd>
          </div>
          <div className="min-w-0 md:border-l md:border-[var(--border-subtle)] md:pl-6">
            <dt className={factLabelClass}>{t('idLabel')}</dt>
            <dd className="mt-2 break-all font-mono text-xs text-text-secondary">{org.id}</dd>
          </div>
        </dl>

        {!org.isActive && (
          <p className="mt-5 border-t border-[var(--border-subtle)] pt-4 text-sm text-[var(--danger-text-adaptive)]">
            {t('deactivatedOn', {
              date: org.deactivatedAt ? date(org.deactivatedAt) : '—',
              reason: org.deactivationReason ?? t('noReason'),
            })}
          </p>
        )}
      </section>

      {/* ─── Créditos, suscripción y overage ───────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-3">
        <CreditsCard org={org} />

        <StatCard icon={Receipt} iconColor={statusColor} label={t('subscriptionTitle')}>
          {subscription ? (
            <>
              <p className="mt-2 text-2xl font-light tracking-tight">
                <span style={{ color: planColor(subscription.plan) }}>{subscription.plan}</span>
                <span className="ml-2 text-sm font-medium" style={{ color: statusColor }}>
                  {t(`subscriptionStatus.${subscription.status}`)}
                </span>
              </p>
              <div className="mt-3 space-y-1.5">
                <Meter ratio={periodRatio} color="var(--chart-execution)" />
                <p className="text-xs text-text-tertiary">
                  {date(subscription.currentPeriodStart)} – {date(subscription.currentPeriodEnd)}
                </p>
              </div>
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-text-secondary">
                <CalendarClock size={13} />
                {subscription.cancelAtPeriodEnd
                  ? t('cancelsIn', { days: daysUntil(subscription.currentPeriodEnd) })
                  : t('renewsIn', { days: daysUntil(subscription.currentPeriodEnd) })}
              </p>
              <p className="mt-1 text-xs text-text-tertiary">
                {subscription.stripeSubscriptionId ? t('sourceStripe') : t('sourceManual')}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-text-tertiary">{t('noSubscription')}</p>
          )}
        </StatCard>

        <StatCard
          icon={Gauge}
          iconColor={org.allowOverages ? LEVEL_COLOR[usageLevel(overageRatio)] : undefined}
          label={t('overageTitle')}
        >
          <p
            className="mt-2 text-2xl font-light tracking-tight"
            style={{ color: org.allowOverages ? 'var(--success-500)' : undefined }}
          >
            {org.allowOverages ? t('overageAllowed') : t('overageBlocked')}
          </p>
          {org.allowOverages && (
            <div className="mt-3 space-y-1.5">
              {overageLimit > 0 && (
                <Meter ratio={overageRatio} color={LEVEL_COLOR[usageLevel(overageRatio)]} />
              )}
              <p className="text-xs text-text-tertiary">
                {overageLimit === -1
                  ? t('overageUnlimited', { used: num(overageUsed) })
                  : t('overageUsage', { used: num(overageUsed), limit: num(overageLimit) })}
              </p>
            </div>
          )}
          {!org.allowOverages && (
            <p className="mt-3 text-xs text-text-tertiary">{t('overageBlockedHint')}</p>
          )}
        </StatCard>
      </div>

      {/* ─── Uso del plan ──────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h3 className="text-base font-semibold text-text-primary">{t('usageTitle')}</h3>
        <UsageGrid org={org} showCustom />
      </section>

      {/* ─── Zona de peligro ───────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-[var(--danger-banner-border)] p-6">
        <h3 className="flex items-center gap-2 text-base font-semibold text-[var(--danger-text-adaptive)]">
          <AlertTriangle size={16} />
          {t('dangerZone')}
        </h3>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 max-w-xl">
            <p className="text-sm font-medium text-text-primary">
              {org.isActive ? t('deactivateTitle') : t('reactivateTitle')}
            </p>
            <p className="mt-0.5 text-sm text-text-secondary">
              {org.isActive ? t('deactivateDescription') : t('reactivateDescription')}
            </p>
          </div>
          {org.isActive ? (
            <button className={btnDangerGhost} onClick={() => setIsDeactivating(true)}>
              <PowerOff size={16} /> {t('deactivate')}
            </button>
          ) : (
            <button className={btnGhost} onClick={handleReactivate} disabled={reactivate.isPending}>
              {reactivate.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Power size={14} />
              )}
              {t('reactivate')}
            </button>
          )}
        </div>
      </section>

      <Modal isOpen={isDeactivating} onClose={closeDeactivate} title={t('deactivateModalTitle')}>
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-[var(--danger-banner-border)] bg-[var(--danger-banner-bg)] p-4 text-[var(--danger-text-adaptive)]">
            <AlertTriangle size={24} />
            <p className="text-sm font-medium">{t('deactivateWarning')}</p>
          </div>

          <div>
            <label className={labelClass}>{t('reasonLabel')}</label>
            <input
              className={inputClass}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div>
            <label className={labelClass}>{t('confirmLabel', { name: org.name })}</label>
            <input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              autoComplete="off"
              className={inputClass}
            />
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={closeDeactivate} className={btnGhost}>
              {t('cancel')}
            </button>
            <button
              onClick={handleDeactivate}
              disabled={!canDeactivate || deactivate.isPending}
              className={btnDanger}
            >
              {deactivate.isPending && <Loader2 size={16} className="animate-spin" />}
              {deactivate.isPending ? t('deactivating') : t('deactivate')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
