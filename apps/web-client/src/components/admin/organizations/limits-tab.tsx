'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Loader2, Save } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useAdminOrganizationMutations } from '@/hooks/identity/use-admin-organizations';
import { useApiErrorMessage } from '@/hooks/shared/use-api-error-message';
import type {
  AdminOrganizationDetail,
  UpdateAdminCustomLimitsInput,
} from '@/lib/api/endpoints/identity/organizations/organizations-admin-api';
import { btnPrimary, inputClass, labelClass } from '@/app/[locale]/admin/_styles';

interface Props {
  org: AdminOrganizationDetail;
}

type LimitKey =
  | 'customMaxUsers'
  | 'customMaxApiKeys'
  | 'customMaxWorkflows'
  | 'customMaxDatasets'
  | 'customMaxDatasetRows';

type LimitsForm = Record<LimitKey, string>;

const toForm = (org: AdminOrganizationDetail): LimitsForm => ({
  customMaxUsers: org.customMaxUsers?.toString() ?? '',
  customMaxApiKeys: org.customMaxApiKeys?.toString() ?? '',
  customMaxWorkflows: org.customMaxWorkflows?.toString() ?? '',
  customMaxDatasets: org.customMaxDatasets?.toString() ?? '',
  customMaxDatasetRows: org.customMaxDatasetRows?.toString() ?? '',
});

export function LimitsTab({ org }: Props) {
  const t = useTranslations('Admin.LimitsTab');
  const getApiErrorMessage = useApiErrorMessage();
  const LIMIT_FIELDS: {
    key: LimitKey;
    label: string;
    planLimitKey: keyof AdminOrganizationDetail['planLimits']['limits'];
  }[] = [
    { key: 'customMaxUsers', label: t('users'), planLimitKey: 'maxUsers' },
    { key: 'customMaxApiKeys', label: t('apiKeys'), planLimitKey: 'maxApiKeys' },
    { key: 'customMaxWorkflows', label: t('workflows'), planLimitKey: 'maxWorkflows' },
    { key: 'customMaxDatasets', label: t('datasets'), planLimitKey: 'maxDatasets' },
    { key: 'customMaxDatasetRows', label: t('datasetRows'), planLimitKey: 'maxDatasetRows' },
  ];
  const { updateCustomLimits, toggleOverage } = useAdminOrganizationMutations();

  const [form, setForm] = useState<LimitsForm>(() => toForm(org));
  useEffect(() => setForm(toForm(org)), [org]);
  const limitsDirty = JSON.stringify(form) !== JSON.stringify(toForm(org));

  const [allowOverages, setAllowOverages] = useState(org.allowOverages);
  const [overageLimit, setOverageLimit] = useState(org.overageLimit?.toString() ?? '');
  useEffect(() => {
    setAllowOverages(org.allowOverages);
    setOverageLimit(org.overageLimit?.toString() ?? '');
  }, [org]);
  const overageDirty =
    allowOverages !== org.allowOverages || overageLimit !== (org.overageLimit?.toString() ?? '');

  const handleSaveLimits = () => {
    // Solo se manda lo que cambió (el backend ignora los campos ausentes del body, no
    // los resetea). Si cambió a vacío, se manda `null` explícito para borrar el override
    // — mandar `undefined` ahí dejaría el valor viejo intacto en vez de volver al plan.
    const initial = toForm(org);
    const payload: UpdateAdminCustomLimitsInput = {};
    for (const { key } of LIMIT_FIELDS) {
      if (form[key] === initial[key]) continue;
      payload[key] = form[key].trim() === '' ? null : Number(form[key]);
    }

    updateCustomLimits.mutate(
      { id: org.id, data: payload },
      {
        onSuccess: () => toast.success(t('limitsUpdated')),
        onError: (e: any) => !e?.toastHandled && toast.error(getApiErrorMessage(e)),
      },
    );
  };

  const handleSaveOverage = () => {
    toggleOverage.mutate(
      {
        id: org.id,
        data: {
          allowOverages,
          overageLimit: overageLimit.trim() === '' ? undefined : Number(overageLimit),
        },
      },
      {
        onSuccess: () => toast.success(t('overageUpdated')),
        onError: (e: any) => !e?.toastHandled && toast.error(getApiErrorMessage(e)),
      },
    );
  };

  return (
    <div className="w-full space-y-6">
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-1 text-sm font-semibold text-text-primary">{t('customLimitsTitle')}</h2>
        <p className="mb-4 text-xs text-text-secondary">{t('customLimitsHint', { plan: org.plan })}</p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {LIMIT_FIELDS.map(({ key, label, planLimitKey }) => {
            const planDefault = org.planLimits.limits[planLimitKey];
            return (
              <div key={key}>
                <label className={labelClass}>{label}</label>
                <input
                  type="number"
                  className={inputClass}
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={t('planPlaceholder', {
                    value: planDefault === -1 ? t('unlimited') : planDefault,
                  })}
                />
              </div>
            );
          })}
        </div>

        <div className="flex justify-end pt-4">
          <button
            className={btnPrimary}
            onClick={handleSaveLimits}
            disabled={!limitsDirty || updateCustomLimits.isPending}
          >
            {updateCustomLimits.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            {t('saveLimits')}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">{t('overageTitle')}</h2>
        <div className="space-y-3">
          <Switch
            checked={allowOverages}
            onChange={setAllowOverages}
            label={t('allowNegativeBalance')}
            hint={t('allowNegativeBalanceHint')}
          />
          <div className="max-w-xs">
            <label className={labelClass}>{t('overageLimitLabel')}</label>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={overageLimit}
              onChange={(e) => setOverageLimit(e.target.value)}
              placeholder={t('overageLimitPlaceholder', { value: org.planLimits.limits.monthlyCredits })}
              disabled={!allowOverages}
            />
          </div>
        </div>
        <div className="flex justify-end pt-4">
          <button
            className={btnPrimary}
            onClick={handleSaveOverage}
            disabled={!overageDirty || toggleOverage.isPending}
          >
            {toggleOverage.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            {t('saveOverage')}
          </button>
        </div>
      </section>
    </div>
  );
}
