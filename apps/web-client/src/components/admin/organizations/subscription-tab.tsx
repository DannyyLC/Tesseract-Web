'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Save } from 'lucide-react';
import { useUpdateAdminSubscription } from '@/hooks/billing/use-admin-billing';
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
        onSuccess: () => toast.success('Suscripción actualizada'),
        onError: (e: any) => !e?.toastHandled && toast.error(e?.message ?? 'No se pudo actualizar'),
      },
    );
  };

  if (isStripeManaged) {
    return (
      <div className="w-full space-y-4">
        <p className="rounded-lg border border-border bg-surface-secondary px-3 py-2 text-xs text-text-secondary">
          Esta organización factura por Stripe. La suscripción se gestiona desde ahí (o desde el
          flujo normal de cambio de plan) — editarla a mano se perdería en el próximo webhook.
        </p>
        <dl className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-text-secondary">Plan</dt>
            <dd className="text-sm text-text-primary">{org.subscription?.plan}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-secondary">Estado</dt>
            <dd className="text-sm text-text-primary">{org.subscription?.status}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-secondary">Período actual</dt>
            <dd className="text-sm text-text-primary">
              {new Date(org.subscription!.currentPeriodStart).toLocaleDateString('es-MX')} –{' '}
              {new Date(org.subscription!.currentPeriodEnd).toLocaleDateString('es-MX')}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-text-secondary">Se cancela al fin del período</dt>
            <dd className="text-sm text-text-primary">
              {org.subscription?.cancelAtPeriodEnd ? 'Sí' : 'No'}
            </dd>
          </div>
        </dl>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <p className="text-xs text-text-secondary">
        Organización de facturación manual (sin Stripe). Estos valores se guardan directo, sin
        pasar por ningún checkout.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={labelClass}>Plan</label>
          <select className={inputClass} value={form.plan} onChange={(e) => set('plan', e.target.value as Form['plan'])}>
            {PLANS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Estado</label>
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
          <label className={labelClass}>Fin del período actual</label>
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
            No renovar al final del período
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
          Guardar
        </button>
      </div>
    </div>
  );
}
