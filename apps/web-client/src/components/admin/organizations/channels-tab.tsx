'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Loader2, MessageSquareText, Pencil, Plus, Power, PowerOff, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { LogoLoader } from '@/components/ui/logo-loader';
import { useAdminWorkflows } from '@/hooks/automation/use-admin-workflows';
import { useAdminWhatsappMutations, useAdminWhatsappNumbers } from '@/hooks/messaging/use-admin-whatsapp-config';
import { useApiErrorMessage } from '@/hooks/shared/use-api-error-message';
import type { WhatsAppConfig } from '@tesseract/types';
import { btnGhost, btnPrimary, inputClass, labelClass } from '@/app/[locale]/admin/_styles';
import { WhatsappTemplatesAdminModal } from './whatsapp-templates-admin-modal';

interface Props {
  organizationId: string;
}

const WHATSAPP_PHONE_REGEX = /^\+\d{8,15}$/;
const UNASSIGNED = '__unassigned__';

const CONNECTION_STYLE: Record<string, string> = {
  CONNECTED: 'text-success-600',
  ERROR: 'text-danger',
  DISCONNECTED: 'text-warning-600',
  PENDING: 'text-text-tertiary',
};

/**
 * Canales de WhatsApp de la organización. El número nace ligado a un workflow (acá, o
 * desde la pestaña Ajustes del workflow mismo — ver `workflow-channels-section.tsx`),
 * pero a diferencia de antes se puede reasignar sin perder sus templates: la única forma
 * de "mover" un número solía ser borrarlo y crearlo de nuevo.
 */
export function ChannelsTab({ organizationId }: Props) {
  const t = useTranslations('Admin.ChannelsTab');
  const getApiErrorMessage = useApiErrorMessage();
  const { data: configs, isLoading } = useAdminWhatsappNumbers(organizationId);
  const { data: workflowsPage } = useAdminWorkflows({ organizationId, limit: 100 });
  const { createConfig, updateConfig, deleteConfig, setActive } = useAdminWhatsappMutations(organizationId);

  // Un número no puede rutear a un workflow interno del super admin — el backend ya lo
  // rechaza, esto es solo para no ofrecerlo en el selector.
  const workflows = useMemo(
    () => (workflowsPage?.data ?? []).filter((w) => !w.isInternal),
    [workflowsPage],
  );
  const workflowNameById = useMemo(() => new Map(workflows.map((w) => [w.id, w.name])), [workflows]);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [createDisplayName, setCreateDisplayName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  // Vacío = "elige un workflow", a propósito distinto de UNASSIGNED: al crear, el
  // workflow es obligatorio (ver create-config.dto.ts); UNASSIGNED solo tiene sentido
  // al editar, para desasignar uno que ya existía.
  const [createWorkflowId, setCreateWorkflowId] = useState('');

  const [editTarget, setEditTarget] = useState<WhatsAppConfig | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editWorkflowId, setEditWorkflowId] = useState(UNASSIGNED);

  const [templatesTarget, setTemplatesTarget] = useState<WhatsAppConfig | null>(null);

  const isPhoneValid = WHATSAPP_PHONE_REGEX.test(phoneNumber);
  const canCreate = isPhoneValid && createWorkflowId !== '';

  const closeCreate = () => {
    setIsCreateOpen(false);
    setPhoneNumber('');
    setCreateDisplayName('');
    setCreateDescription('');
    setCreateWorkflowId('');
  };

  const openEdit = (config: WhatsAppConfig) => {
    setEditTarget(config);
    setEditDisplayName(config.displayName ?? '');
    setEditDescription(config.description ?? '');
    setEditWorkflowId(config.defaultWorkflowId ?? UNASSIGNED);
  };

  const handleCreate = () => {
    if (!canCreate) return;
    createConfig.mutate(
      {
        phoneNumber,
        workflowId: createWorkflowId,
        displayName: createDisplayName.trim() || undefined,
        description: createDescription.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success(t('createdSuccess'));
          closeCreate();
        },
        onError: (e: any) => !e?.toastHandled && toast.error(getApiErrorMessage(e)),
      },
    );
  };

  const handleSaveEdit = () => {
    if (!editTarget) return;
    updateConfig.mutate(
      {
        id: editTarget.id,
        data: {
          displayName: editDisplayName,
          description: editDescription,
          workflowId: editWorkflowId === UNASSIGNED ? null : editWorkflowId,
        },
      },
      {
        onSuccess: () => {
          toast.success(t('savedSuccess'));
          setEditTarget(null);
        },
        onError: (e: any) => !e?.toastHandled && toast.error(getApiErrorMessage(e)),
      },
    );
  };

  const handleDelete = (config: WhatsAppConfig) => {
    deleteConfig.mutate(config.id, {
      onSuccess: () => toast.success(t('deletedSuccess')),
      onError: (e: any) => !e?.toastHandled && toast.error(getApiErrorMessage(e)),
    });
  };

  const handleToggleActive = (config: WhatsAppConfig) => {
    setActive.mutate(
      { id: config.id, isActive: !config.isActive },
      { onError: (e: any) => !e?.toastHandled && toast.error(getApiErrorMessage(e)) },
    );
  };

  return (
    <div className="w-full space-y-6">
      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">{t('title')}</h2>
            <p className="mt-1 text-xs text-text-secondary">{t('subtitle')}</p>
          </div>
          <button className={btnPrimary} onClick={() => setIsCreateOpen(true)}>
            <Plus size={14} /> {t('addNumber')}
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <LogoLoader text={t('loading')} />
          </div>
        ) : !configs?.length ? (
          <p className="px-2 py-8 text-center text-sm text-text-secondary">{t('empty')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {configs.map((config) => {
              const workflowName = config.defaultWorkflowId
                ? (workflowNameById.get(config.defaultWorkflowId) ?? t('deletedWorkflow'))
                : null;
              return (
                <li key={config.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium text-text-primary">
                        {config.displayName || config.phoneNumber}
                      </span>
                      {config.displayName && (
                        <span className="text-xs text-text-secondary">{config.phoneNumber}</span>
                      )}
                      {!config.isActive && (
                        <span className="text-xs text-danger">{t('inactiveBadge')}</span>
                      )}
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
                      <span className={CONNECTION_STYLE[config.connectionStatus] ?? 'text-text-tertiary'}>
                        {config.connectionStatus}
                      </span>
                      <span>
                        {workflowName ? t('routesTo', { workflow: workflowName }) : t('noWorkflowAssigned')}
                      </span>
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => setTemplatesTarget(config)}
                      title={t('templatesTitle')}
                      className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
                    >
                      <MessageSquareText size={16} />
                    </button>
                    <button
                      onClick={() => openEdit(config)}
                      title={t('editTitle')}
                      className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => handleToggleActive(config)}
                      title={config.isActive ? t('deactivateTitle') : t('activateTitle')}
                      className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
                    >
                      {config.isActive ? <PowerOff size={16} /> : <Power size={16} />}
                    </button>
                    <button
                      onClick={() => handleDelete(config)}
                      title={t('deleteTitle')}
                      className="hover:bg-danger/10 rounded-lg p-2 text-danger transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Crear */}
      <Modal isOpen={isCreateOpen} onClose={closeCreate} title={t('createModalTitle')}>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>{t('phoneNumberLabel')}</label>
            <input
              className={inputClass}
              value={phoneNumber}
              onChange={(e) =>
                setPhoneNumber(e.target.value.replace(/(?!^)\+/g, '').replace(/[^+\d]/g, ''))
              }
              placeholder="+52234567890"
              inputMode="tel"
              maxLength={16}
            />
            {phoneNumber.length > 11 && !isPhoneValid && (
              <p className="mt-1 text-xs text-danger">{t('phoneInvalid')}</p>
            )}
          </div>

          <div>
            <label className={labelClass}>{t('displayNameLabel')}</label>
            <input
              className={inputClass}
              value={createDisplayName}
              onChange={(e) => setCreateDisplayName(e.target.value)}
              placeholder={t('displayNamePlaceholder')}
            />
          </div>

          <div>
            <label className={labelClass}>{t('descriptionLabel')}</label>
            <input
              className={inputClass}
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
            />
          </div>

          <div>
            <label className={labelClass}>{t('workflowLabel')}</label>
            <select
              className={inputClass}
              value={createWorkflowId}
              onChange={(e) => setCreateWorkflowId(e.target.value)}
            >
              <option value="" disabled>
                {t('selectWorkflow')}
              </option>
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-text-tertiary">{t('createWorkflowHint')}</p>
          </div>

          <div className="flex justify-end gap-2">
            <button className={btnGhost} onClick={closeCreate}>
              {t('cancel')}
            </button>
            <button
              className={btnPrimary}
              onClick={handleCreate}
              disabled={!canCreate || createConfig.isPending}
            >
              {createConfig.isPending && <Loader2 size={14} className="animate-spin" />}
              {t('create')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Editar */}
      <Modal isOpen={!!editTarget} onClose={() => setEditTarget(null)} title={t('editModalTitle')}>
        {editTarget && (
          <div className="space-y-4">
            <div>
              <label className={labelClass}>{t('editDisplayNameLabel')}</label>
              <input
                className={inputClass}
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>{t('editDescriptionLabel')}</label>
              <input
                className={inputClass}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>{t('workflowLabel')}</label>
              <select
                className={inputClass}
                value={editWorkflowId}
                onChange={(e) => setEditWorkflowId(e.target.value)}
              >
                <option value={UNASSIGNED}>{t('unassigned')}</option>
                {workflows.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-text-tertiary">{t('editWorkflowHint')}</p>
            </div>

            <div className="flex justify-end gap-2">
              <button className={btnGhost} onClick={() => setEditTarget(null)}>
                {t('cancel')}
              </button>
              <button className={btnPrimary} onClick={handleSaveEdit} disabled={updateConfig.isPending}>
                {updateConfig.isPending && <Loader2 size={14} className="animate-spin" />}
                {t('save')}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {templatesTarget && (
        <WhatsappTemplatesAdminModal
          isOpen={!!templatesTarget}
          onClose={() => setTemplatesTarget(null)}
          organizationId={organizationId}
          configId={templatesTarget.id}
          configLabel={templatesTarget.displayName || templatesTarget.phoneNumber}
        />
      )}
    </div>
  );
}
