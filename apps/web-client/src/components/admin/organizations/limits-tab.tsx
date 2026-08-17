'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Save } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useAdminOrganizationMutations } from '@/hooks/identity/use-admin-organizations';
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

const LIMIT_FIELDS: { key: LimitKey; label: string; planLimitKey: keyof AdminOrganizationDetail['planLimits']['limits'] }[] = [
  { key: 'customMaxUsers', label: 'Usuarios', planLimitKey: 'maxUsers' },
  { key: 'customMaxApiKeys', label: 'API keys', planLimitKey: 'maxApiKeys' },
  { key: 'customMaxWorkflows', label: 'Workflows', planLimitKey: 'maxWorkflows' },
  { key: 'customMaxDatasets', label: 'Datasets', planLimitKey: 'maxDatasets' },
  { key: 'customMaxDatasetRows', label: 'Filas de datasets (todas sumadas)', planLimitKey: 'maxDatasetRows' },
];

type LimitsForm = Record<LimitKey, string>;

const toForm = (org: AdminOrganizationDetail): LimitsForm => ({
  customMaxUsers: org.customMaxUsers?.toString() ?? '',
  customMaxApiKeys: org.customMaxApiKeys?.toString() ?? '',
  customMaxWorkflows: org.customMaxWorkflows?.toString() ?? '',
  customMaxDatasets: org.customMaxDatasets?.toString() ?? '',
  customMaxDatasetRows: org.customMaxDatasetRows?.toString() ?? '',
});

export function LimitsTab({ org }: Props) {
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
        onSuccess: () => toast.success('Límites actualizados'),
        onError: (e: any) => !e?.toastHandled && toast.error(e?.message ?? 'No se pudo guardar'),
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
        onSuccess: () => toast.success('Sobregiro actualizado'),
        onError: (e: any) => !e?.toastHandled && toast.error(e?.message ?? 'No se pudo guardar'),
      },
    );
  };

  return (
    <div className="w-full space-y-6">
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-1 text-sm font-semibold text-text-primary">Límites custom</h2>
        <p className="mb-4 text-xs text-text-secondary">
          Vacío = usa el default del plan ({org.plan}). <strong>-1</strong> = ilimitado. Si un
          campo ya tenía un override, dejarlo vacío y guardar lo borra.
        </p>

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
                  placeholder={`Plan: ${planDefault === -1 ? 'ilimitado' : planDefault}`}
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
            Guardar límites
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Sobregiro de créditos</h2>
        <div className="space-y-3">
          <Switch
            checked={allowOverages}
            onChange={setAllowOverages}
            label="Permitir balance negativo"
            hint="La organización puede seguir ejecutando workflows aunque se quede sin créditos, hasta el límite de abajo."
          />
          <div className="max-w-xs">
            <label className={labelClass}>Límite de sobregiro (créditos)</label>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={overageLimit}
              onChange={(e) => setOverageLimit(e.target.value)}
              placeholder={`Máx. ${org.planLimits.limits.monthlyCredits} (créditos del plan)`}
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
            Guardar sobregiro
          </button>
        </div>
      </section>
    </div>
  );
}
