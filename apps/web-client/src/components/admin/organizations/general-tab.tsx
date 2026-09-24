'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useLocale, useTranslations } from 'next-intl';
import { AlertTriangle, Loader2, Power, PowerOff } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { useAdminOrganizationMutations } from '@/hooks/identity/use-admin-organizations';
import { useApiErrorMessage } from '@/hooks/shared/use-api-error-message';
import { toIntlLocale } from '@/lib/intl-locale';
import type { AdminOrganizationDetail } from '@/lib/api/endpoints/identity/organizations/organizations-admin-api';
import { btnGhost, inputClass, labelClass } from '@/app/[locale]/admin/_styles';

interface Props {
  org: AdminOrganizationDetail;
}

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
        onError: (e: any) => !e?.toastHandled && toast.error(getApiErrorMessage(e)),
      },
    );
  };

  const handleReactivate = () => {
    reactivate.mutate(org.id, {
      onSuccess: () => toast.success(t('reactivateSuccess')),
      onError: (e: any) => !e?.toastHandled && toast.error(getApiErrorMessage(e)),
    });
  };

  return (
    <div className="w-full space-y-6">
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">{t('infoTitle')}</h2>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-text-secondary">{t('name')}</dt>
            <dd className="text-sm text-text-primary">{org.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-secondary">{t('slug')}</dt>
            <dd className="text-sm text-text-primary">{org.slug}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-secondary">{t('plan')}</dt>
            <dd className="text-sm text-text-primary">{org.plan}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-secondary">{t('created')}</dt>
            <dd className="text-sm text-text-primary">
              {new Date(org.createdAt).toLocaleDateString(intlLocale)}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">{t('usageTitle')}</h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <div>
            <dt className="text-xs text-text-secondary">{t('users')}</dt>
            <dd className="text-sm text-text-primary">
              {org.usage.users} / {org.planLimits.limits.maxUsers === -1 ? '∞' : org.planLimits.limits.maxUsers}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-text-secondary">{t('workflows')}</dt>
            <dd className="text-sm text-text-primary">
              {org.usage.workflows} /{' '}
              {org.planLimits.limits.maxWorkflows === -1 ? '∞' : org.planLimits.limits.maxWorkflows}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-text-secondary">{t('apiKeys')}</dt>
            <dd className="text-sm text-text-primary">
              {org.usage.apiKeys} /{' '}
              {org.planLimits.limits.maxApiKeys === -1 ? '∞' : org.planLimits.limits.maxApiKeys}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-text-secondary">{t('catalogs')}</dt>
            <dd className="text-sm text-text-primary">
              {org.usage.datasets} /{' '}
              {org.planLimits.limits.maxDatasets === -1 ? '∞' : org.planLimits.limits.maxDatasets}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-text-secondary">{t('catalogRows')}</dt>
            <dd className="text-sm text-text-primary">
              {org.usage.datasetRows} /{' '}
              {org.planLimits.limits.maxDatasetRows === -1 ? '∞' : org.planLimits.limits.maxDatasetRows}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">{t('statusTitle')}</h2>
        {org.isActive ? (
          <>
            <p className="mb-3 text-sm text-text-secondary">{t('statusActive')}</p>
            <button
              className="hover:bg-danger/10 flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-danger-600"
              onClick={() => setIsDeactivating(true)}
            >
              <PowerOff size={16} /> {t('deactivate')}
            </button>
          </>
        ) : (
          <>
            <p className="mb-3 text-sm text-text-secondary">
              {t('statusInactive', {
                reason: org.deactivationReason ? `: ${org.deactivationReason}` : '',
              })}
            </p>
            <button
              className={btnGhost}
              onClick={handleReactivate}
              disabled={reactivate.isPending}
            >
              {reactivate.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Power size={14} />
              )}
              {t('reactivate')}
            </button>
          </>
        )}
      </section>

      <Modal isOpen={isDeactivating} onClose={closeDeactivate} title={t('deactivateModalTitle')}>
        <div className="space-y-4">
          <div className="bg-danger/10 flex items-center gap-3 rounded-xl p-4 text-danger-600">
            <AlertTriangle size={24} />
            <p className="text-sm font-medium">{t('deactivateWarning')}</p>
          </div>

          <div>
            <label className={labelClass}>{t('reasonLabel')}</label>
            <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>

          <div>
            <label className={labelClass}>
              {t('confirmLabel', { name: org.name })}
            </label>
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
              className="flex items-center gap-2 rounded-lg bg-danger-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
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
