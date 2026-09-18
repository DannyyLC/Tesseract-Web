'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2, RotateCcw, Save, Trash2 } from 'lucide-react';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { Switch } from '@/components/ui/switch';
import { useAdminWorkflowMutations } from '@/hooks/automation/use-admin-workflows';
import { useApiErrorMessage } from '@/hooks/shared/use-api-error-message';
import { toIntlLocale } from '@/lib/intl-locale';
import type { AdminWorkflowDetail } from '@/lib/api/endpoints/automation/workflows/workflows-admin-api';
import { btnGhost, btnPrimary, inputClass, labelClass } from '@/app/[locale]/admin/_styles';
import { WorkflowChannelsSection } from './workflow-channels-section';

interface Props {
  workflow: AdminWorkflowDetail;
}

type Form = {
  name: string;
  description: string;
  category: 'LIGHT' | 'STANDARD' | 'ADVANCED';
  maxHistoryTokens: number;
  isActive: boolean;
  isPaused: boolean;
  isInternal: boolean;
  timeout: number;
  maxRetries: number;
};

const toForm = (w: AdminWorkflowDetail): Form => ({
  name: w.name,
  description: w.description ?? '',
  category: w.category,
  maxHistoryTokens: w.maxHistoryTokens,
  isActive: w.isActive,
  isPaused: w.isPaused,
  isInternal: w.isInternal,
  timeout: w.timeout,
  maxRetries: w.maxRetries,
});

/**
 * Metadata del workflow. Va por `PATCH` y no toca el config, así que guardar aquí no
 * genera una versión nueva ni invalida una sesión de edición de prompts en curso.
 */
export function SettingsTab({ workflow }: Props) {
  const t = useTranslations('Admin.SettingsTab');
  const intlLocale = toIntlLocale(useLocale());
  const getApiErrorMessage = useApiErrorMessage();
  const [form, setForm] = useState<Form>(() => toForm(workflow));
  const [confirmPublishOpen, setConfirmPublishOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const { updateMeta, removeWorkflow, restoreWorkflow } = useAdminWorkflowMutations();

  // Si el workflow se recarga (p. ej. tras guardar el config), reflejar lo que llegó.
  useEffect(() => setForm(toForm(workflow)), [workflow]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const setIsInternal = (value: boolean) => {
    // Apagarlo es "publicar": el workflow se vuelve visible y ejecutable para el cliente,
    // que hasta ahora no sabía que existía. Prendiéndolo (ocultarlo de nuevo) no hace
    // falta confirmar: no hay nada que se le revele a nadie.
    if (!value) {
      setConfirmPublishOpen(true);
      return;
    }
    set('isInternal', value);
  };

  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(workflow));

  const handleDelete = async () => {
    try {
      await removeWorkflow.mutateAsync(workflow.id);
      toast.success(t('workflowDeleted'));
      setConfirmDeleteOpen(false);
    } catch (e: any) {
      if (!e?.toastHandled) toast.error(getApiErrorMessage(e));
    }
  };

  const handleRestore = () => {
    restoreWorkflow.mutate(workflow.id, {
      onSuccess: () => toast.success(t('workflowRestored')),
      onError: (e: any) => !e?.toastHandled && toast.error(getApiErrorMessage(e)),
    });
  };

  const handleSave = () => {
    if (form.name.trim().length < 3) return toast.error(t('nameTooShort'));

    updateMeta.mutate(
      {
        id: workflow.id,
        data: { ...form, description: form.description.trim() || undefined },
      },
      {
        onSuccess: () => toast.success(t('settingsSaved')),
        onError: (e: any) => !e?.toastHandled && toast.error(getApiErrorMessage(e)),
      },
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-secondary">{t('intro')}</p>

      <div>
        <label className={labelClass}>{t('nameLabel')}</label>
        <input className={inputClass} value={form.name} onChange={(e) => set('name', e.target.value)} />
      </div>

      <div>
        <label className={labelClass}>{t('descriptionLabel')}</label>
        <textarea
          rows={2}
          className={inputClass}
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>{t('categoryLabel')}</label>
          <select
            className={inputClass}
            value={form.category}
            onChange={(e) => set('category', e.target.value as Form['category'])}
          >
            <option value="LIGHT">{t('categoryLight')}</option>
            <option value="STANDARD">{t('categoryStandard')}</option>
            <option value="ADVANCED">{t('categoryAdvanced')}</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>{t('maxTokensLabel')}</label>
          <input
            type="number"
            min={1000}
            max={200000}
            className={inputClass}
            value={form.maxHistoryTokens}
            onChange={(e) => set('maxHistoryTokens', Number(e.target.value))}
          />
        </div>
        <div>
          <label className={labelClass}>{t('timeoutLabel')}</label>
          <input
            type="number"
            min={30}
            max={3600}
            className={inputClass}
            value={form.timeout}
            onChange={(e) => set('timeout', Number(e.target.value))}
          />
        </div>
        <div>
          <label className={labelClass}>{t('maxRetriesLabel')}</label>
          <input
            type="number"
            min={0}
            max={10}
            className={inputClass}
            value={form.maxRetries}
            onChange={(e) => set('maxRetries', Number(e.target.value))}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border p-3">
          <Switch
            checked={form.isActive}
            onChange={(v) => set('isActive', v)}
            label={t('activeLabel')}
            hint={t('activeHint')}
          />
        </div>
        <div className="rounded-lg border border-border p-3">
          <Switch
            checked={form.isPaused}
            onChange={(v) => set('isPaused', v)}
            label={t('pausedLabel')}
            hint={t('pausedHint')}
          />
        </div>
        <div className="rounded-lg border border-border p-3 sm:col-span-2">
          <Switch
            checked={form.isInternal}
            onChange={setIsInternal}
            label={t('internalLabel')}
            hint={t('internalHint')}
          />
        </div>
      </div>

      <WorkflowChannelsSection workflowId={workflow.id} organizationId={workflow.organization.id} />

      <div className="rounded-lg border border-danger p-3">
        <p className="text-xs font-medium text-danger">{t('dangerZone')}</p>
        {workflow.deletedAt ? (
          <>
            <p className="mt-1 text-xs text-text-secondary">
              {t('deletedSince', { date: new Date(workflow.deletedAt).toLocaleString(intlLocale) })}
            </p>
            <button
              className={`${btnGhost} mt-2`}
              onClick={handleRestore}
              disabled={restoreWorkflow.isPending}
            >
              {restoreWorkflow.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RotateCcw size={14} />
              )}
              {t('restoreWorkflow')}
            </button>
          </>
        ) : (
          <>
            <p className="mt-1 text-xs text-text-secondary">{t('stopsImmediatelyHint')}</p>
            <button
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-danger px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
              onClick={() => setConfirmDeleteOpen(true)}
              disabled={removeWorkflow.isPending}
            >
              {removeWorkflow.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Trash2 size={14} />
              )}
              {t('deleteWorkflow')}
            </button>
          </>
        )}
      </div>

      <div className="flex justify-end pt-2">
        <button className={btnPrimary} onClick={handleSave} disabled={!dirty || updateMeta.isPending}>
          {updateMeta.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {t('saveSettings')}
        </button>
      </div>

      <ConfirmModal
        isOpen={confirmPublishOpen}
        onClose={() => setConfirmPublishOpen(false)}
        onConfirm={() => {
          set('isInternal', false);
          setConfirmPublishOpen(false);
        }}
        variant="warning"
        title={t('publishModalTitle')}
        message={t('publishModalMessage')}
        confirmLabel={t('publish')}
      />

      <ConfirmModal
        isOpen={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={handleDelete}
        variant="danger"
        title={t('deleteModalTitle')}
        message={t('deleteModalMessage')}
        confirmLabel={t('delete')}
      />
    </div>
  );
}
