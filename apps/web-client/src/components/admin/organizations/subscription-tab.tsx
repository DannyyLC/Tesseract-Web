'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2, Save } from 'lucide-react';
import { useUpdateAdminSubscription } from '@/hooks/billing/use-admin-billing';
import { useApiErrorMessage } from '@/hooks/shared/use-api-error-message';
import { toIntlLocale } from '@/lib/intl-locale';
import type { AdminOrganizationDetail } from '@/lib/api/endpoints/identity/organizations/organizations-admin-api';
import { btnPrimary, inputClass, labelClass } from '@/app/[locale]/admin/_styles';

interface Props {
  org: AdminOrganizationDetail;
}

const PLANS = ['FREE', 'STARTER', 'GROWTH', 'BUSINESS', 'PRO', 'ENTERPRISE'] as const;
const STATUSES = ['ACTIVE', 'CANCELED', 'PAST_DUE', 'INCOMPLETE'] as const;

type Form = {
  plan: (typeof PLANS)[number];
  status: (typeof STATUSES)[number];
  currentPeriodEnd: string; // yyyy-mm-dd, para <input type="date">
  cancelAtPeriodEnd: boolean;
};

const toForm = (org: AdminOrganizationDetail): Form => ({
  plan: (org.subscription?.plan as Form['plan']) ?? org.plan,
  status: (org.subscription?.status as Form['status']) ?? 'ACTIVE',
  currentPeriodEnd: org.subscription?.currentPeriodEnd
    ? org.subscription.currentPeriodEnd.slice(0, 10)
    : '',
  cancelAtPeriodEnd: org.subscription?.cancelAtPeriodEnd ?? false,
});

/**
 * Si la organización factura por Stripe, la suscripción es de solo lectura: un webhook
 * posterior la pisaría en silencio si se editara a mano. Solo es editable para
 * organizaciones de facturación manual (transferencia).
 */
export function SubscriptionTab({ org }: Props) {
  const t = useTranslations('Admin.SubscriptionTab');
  const intlLocale = toIntlLocale(useLocale());
  const getApiErrorMessage = useApiErrorMessage();
  const isStripeManaged = !!org.subscription?.stripeSubscriptionId;
  const [form, setForm] = useState<Form>(() => toForm(org));
  const updateSubscription = useUpdateAdminSubscription();

  useEffect(() => setForm(toForm(org)), [org]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(org));

  const handleSave = () => {
    updateSubscription.mutate(
      {
        organizationId: org.id,
        data: {
          plan: form.plan,
          status: form.status,
          currentPeriodEnd: form.currentPeriodEnd
            ? new Date(form.currentPeriodEnd).toISOString()
            : undefined,
          cancelAtPeriodEnd: form.cancelAtPeriodEnd,
        },
      },
      {
        onSuccess: () => toast.success(t('updated')),
        onError: (e: any) => !e?.toastHandled && toast.error(getApiErrorMessage(e)),
      },
    );
  };

  if (isStripeManaged) {
    return (
      <div className="w-full space-y-4">
        <p className="rounded-lg border border-border bg-surface-secondary px-3 py-2 text-xs text-text-secondary">
          {t('stripeManagedHint')}
        </p>
        <dl className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-text-secondary">{t('plan')}</dt>
            <dd className="text-sm text-text-primary">{org.subscription?.plan}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-secondary">{t('status')}</dt>
            <dd className="text-sm text-text-primary">{org.subscription?.status}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-secondary">{t('currentPeriod')}</dt>
            <dd className="text-sm text-text-primary">
              {new Date(org.subscription!.currentPeriodStart).toLocaleDateString(intlLocale)} –{' '}
              {new Date(org.subscription!.currentPeriodEnd).toLocaleDateString(intlLocale)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-text-secondary">{t('cancelsAtEnd')}</dt>
            <dd className="text-sm text-text-primary">
              {org.subscription?.cancelAtPeriodEnd ? t('yes') : t('no')}
            </dd>
          </div>
        </dl>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <p className="text-xs text-text-secondary">{t('manualBillingHint')}</p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={labelClass}>{t('plan')}</label>
          <select className={inputClass} value={form.plan} onChange={(e) => set('plan', e.target.value as Form['plan'])}>
            {PLANS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>{t('status')}</label>
          <select
            className={inputClass}
            value={form.status}
            onChange={(e) => set('status', e.target.value as Form['status'])}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>{t('periodEnd')}</label>
          <input
            type="date"
            className={inputClass}
            value={form.currentPeriodEnd}
            onChange={(e) => set('currentPeriodEnd', e.target.value)}
          />
        </div>
        <div className="flex items-end pb-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
            <input
              type="checkbox"
              checked={form.cancelAtPeriodEnd}
              onChange={(e) => set('cancelAtPeriodEnd', e.target.checked)}
              className="h-4 w-4 shrink-0 accent-accent"
            />
            {t('noRenew')}
          </label>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button
          className={btnPrimary}
          onClick={handleSave}
          disabled={!dirty || updateSubscription.isPending}
        >
          {updateSubscription.isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Save size={14} />
          )}
          {t('save')}
        </button>
      </div>
    </div>
  );
}
