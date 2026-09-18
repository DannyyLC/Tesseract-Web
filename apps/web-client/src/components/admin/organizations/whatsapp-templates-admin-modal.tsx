'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Loader2, Pencil, Plus, Power, Trash2, X } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import {
  useAdminWhatsappTemplateMutations,
  useAdminWhatsappTemplates,
} from '@/hooks/messaging/use-admin-whatsapp-config';
import { useApiErrorMessage } from '@/hooks/shared/use-api-error-message';
import { btnGhost, btnPrimary, inputClass, labelClass } from '@/app/[locale]/admin/_styles';
import type { WhatsAppTemplate } from '@tesseract/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  configId: string;
  configLabel: string;
}

interface FormState {
  id: string | null;
  name: string;
  displayName: string;
  language: string;
  /** Variables del cuerpo, separadas por coma — es lo que de verdad se usa al mandar. */
  bodyVariables: string;
}

const EMPTY_FORM: FormState = { id: null, name: '', displayName: '', language: 'es_MX', bodyVariables: '' };

/**
 * CRUD de templates de un número — Meta los registra por número (WABA), no por
 * organización ni por workflow, así que el schema los cuelga de `WhatsAppConfig`.
 * Cualquier workflow con acceso a este número puede mandarlos, no solo el que lo tiene
 * como default: no hace falta (ni existe) un vínculo template↔workflow.
 *
 * Header/botones también existen en el schema (`variables.header`/`variables.buttons`)
 * pero se quedan fuera de este formulario a propósito — el caso de uso real es casi
 * siempre variables del cuerpo.
 */
export function WhatsappTemplatesAdminModal({ isOpen, onClose, organizationId, configId, configLabel }: Props) {
  const t = useTranslations('Admin.WhatsappTemplatesModal');
  const getApiErrorMessage = useApiErrorMessage();
  const { data: templates, isLoading } = useAdminWhatsappTemplates(organizationId, isOpen ? configId : null);
  const { createTemplate, updateTemplate, deleteTemplate } = useAdminWhatsappTemplateMutations(
    organizationId,
    configId,
  );

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const startCreate = () => {
    setForm(EMPTY_FORM);
    setIsFormOpen(true);
  };

  const startEdit = (template: WhatsAppTemplate) => {
    setForm({
      id: template.id,
      name: template.name,
      displayName: template.displayName ?? '',
      language: template.language,
      bodyVariables: (template.variables?.body ?? []).join(', '),
    });
    setIsFormOpen(true);
  };

  const handleSubmit = () => {
    const name = form.name.trim();
    if (!name) return;

    const body = form.bodyVariables
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);

    const data = {
      name,
      displayName: form.displayName.trim() || undefined,
      language: form.language.trim() || 'es_MX',
      variables: { body },
    };

    const mutation = form.id
      ? updateTemplate.mutateAsync({ id: form.id, data })
      : createTemplate.mutateAsync(data);

    mutation
      .then(() => {
        toast.success(form.id ? t('templateUpdated') : t('templateCreated'));
        setIsFormOpen(false);
        setForm(EMPTY_FORM);
      })
      .catch((e: any) => !e?.toastHandled && toast.error(getApiErrorMessage(e)));
  };

  const handleDelete = (template: WhatsAppTemplate) => {
    deleteTemplate.mutate(template.id, {
      onSuccess: () => toast.success(t('templateDeleted')),
      onError: (e: any) => !e?.toastHandled && toast.error(getApiErrorMessage(e)),
    });
  };

  const handleToggleActive = (template: WhatsAppTemplate) => {
    updateTemplate.mutate(
      { id: template.id, data: { isActive: !template.isActive } },
      { onError: (e: any) => !e?.toastHandled && toast.error(getApiErrorMessage(e)) },
    );
  };

  const isSaving = createTemplate.isPending || updateTemplate.isPending;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('modalTitle', { config: configLabel })} size="lg">
      <div className="space-y-4">
        <p className="text-xs text-text-secondary">{t('subtitle')}</p>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={20} className="animate-spin text-text-tertiary" />
          </div>
        ) : !templates?.length ? (
          <p className="rounded-xl border border-dashed border-border py-6 text-center text-sm text-text-secondary">
            {t('empty')}
          </p>
        ) : (
          <ul className="space-y-2">
            {templates.map((template) => (
              <li
                key={template.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {template.displayName || template.name}
                  </p>
                  <p className="truncate text-xs text-text-tertiary">
                    {template.name} · {template.language}
                    {!template.isActive && t('inactiveSuffix')}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-text-tertiary">
                    {template.id}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => handleToggleActive(template)}
                    title={template.isActive ? t('deactivateTitle') : t('activateTitle')}
                    className={`rounded-lg p-1.5 transition-colors hover:bg-surface-secondary ${
                      template.isActive ? 'text-success-500' : 'text-text-tertiary'
                    }`}
                  >
                    <Power size={14} />
                  </button>
                  <button
                    onClick={() => startEdit(template)}
                    title={t('editTitle')}
                    className="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-surface-secondary"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(template)}
                    title={t('deleteTitle')}
                    className="hover:bg-danger/10 rounded-lg p-1.5 text-danger transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {isFormOpen ? (
          <div className="space-y-3 rounded-xl border border-border p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-text-primary">
                {form.id ? t('editFormTitle') : t('newFormTitle')}
              </p>
              <button
                onClick={() => setIsFormOpen(false)}
                className="rounded-lg p-1 text-text-tertiary hover:bg-surface-secondary"
              >
                <X size={14} />
              </button>
            </div>

            <div>
              <label className={labelClass}>{t('nameLabel')}</label>
              <input
                className={inputClass}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t('namePlaceholder')}
              />
              <p className="mt-1 text-[11px] text-text-tertiary">{t('nameHint')}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>{t('displayNameLabel')}</label>
                <input
                  className={inputClass}
                  value={form.displayName}
                  onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                />
              </div>
              <div>
                <label className={labelClass}>{t('languageLabel')}</label>
                <input
                  className={inputClass}
                  value={form.language}
                  onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
                  placeholder="es_MX"
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>{t('bodyVariablesLabel')}</label>
              <input
                className={inputClass}
                value={form.bodyVariables}
                onChange={(e) => setForm((f) => ({ ...f, bodyVariables: e.target.value }))}
                placeholder={t('bodyVariablesPlaceholder')}
              />
              <p className="mt-1 text-[11px] text-text-tertiary">{t('bodyVariablesHint')}</p>
            </div>

            <button
              className={`${btnPrimary} w-full justify-center`}
              onClick={handleSubmit}
              disabled={!form.name.trim() || isSaving}
            >
              {isSaving && <Loader2 size={14} className="animate-spin" />}
              {form.id ? t('save') : t('createTemplate')}
            </button>
          </div>
        ) : (
          <button
            onClick={startCreate}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-2.5 text-sm font-medium text-text-secondary transition-colors hover:border-border-hover hover:text-text-primary"
          >
            <Plus size={16} />
            {t('addTemplate')}
          </button>
        )}

        <div className="flex justify-end pt-1">
          <button className={btnGhost} onClick={onClose}>
            {t('close')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
