'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Loader2, Plus, Radio } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Link } from '@/i18n/routing';
import { useAdminWhatsappMutations, useAdminWhatsappNumbers } from '@/hooks/messaging/use-admin-whatsapp-config';
import { useApiErrorMessage } from '@/hooks/shared/use-api-error-message';
import { btnGhost, btnPrimary, inputClass, labelClass } from '@/app/[locale]/admin/_styles';

interface Props {
  workflowId: string;
  organizationId: string;
}

const WHATSAPP_PHONE_REGEX = /^\+\d{8,15}$/;

/**
 * Segunda entrada para dar de alta un número — la otra es la pestaña Canales de la
 * organización. Acá el workflow ya está fijo (es el que se está viendo), así que el
 * formulario solo pide el teléfono. Se dejan las dos a propósito para ver cuál se usa
 * más antes de decidir si vale la pena consolidar en una sola.
 *
 * Reusa `useAdminWhatsappNumbers(organizationId)` (la misma query que la pestaña
 * Canales) y filtra en cliente por `defaultWorkflowId` — no vale la pena un endpoint
 * nuevo solo para esto: una organización real tiene un puñado de números, no miles.
 */
export function WorkflowChannelsSection({ workflowId, organizationId }: Props) {
  const t = useTranslations('Admin.WorkflowChannelsSection');
  const getApiErrorMessage = useApiErrorMessage();
  const { data: configs, isLoading } = useAdminWhatsappNumbers(organizationId);
  const { createConfig } = useAdminWhatsappMutations(organizationId);

  const channels = useMemo(
    () => (configs ?? []).filter((c) => c.defaultWorkflowId === workflowId),
    [configs, workflowId],
  );

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const isPhoneValid = WHATSAPP_PHONE_REGEX.test(phoneNumber);

  const closeCreate = () => {
    setIsCreateOpen(false);
    setPhoneNumber('');
    setDisplayName('');
    setDescription('');
  };

  const handleCreate = () => {
    if (!isPhoneValid) return;
    createConfig.mutate(
      {
        phoneNumber,
        workflowId,
        displayName: displayName.trim() || undefined,
        description: description.trim() || undefined,
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

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-text-primary">{t('title')}</p>
          <p className="text-xs text-text-secondary">{t('subtitle')}</p>
        </div>
        <button className={btnGhost} onClick={() => setIsCreateOpen(true)}>
          <Plus size={14} /> {t('addNumber')}
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 size={16} className="animate-spin text-text-tertiary" />
        </div>
      ) : channels.length === 0 ? (
        <p className="mt-2 text-xs text-text-secondary">{t('empty')}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {channels.map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-sm text-text-primary">
              <Radio size={12} className="shrink-0 text-text-tertiary" />
              <span className="truncate">{c.displayName || c.phoneNumber}</span>
              {c.displayName && (
                <span className="shrink-0 text-xs text-text-secondary">{c.phoneNumber}</span>
              )}
              {!c.isActive && (
                <span className="shrink-0 text-xs text-danger">{t('inactiveBadge')}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <Link
        href={`/admin/organizaciones/${organizationId}?tab=channels`}
        className="mt-3 inline-block text-xs text-accent hover:underline"
      >
        {t('manageAllLink')}
      </Link>

      <Modal isOpen={isCreateOpen} onClose={closeCreate} title={t('modalTitle')}>
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
            <p className="mt-1 text-xs text-text-tertiary">{t('linkedHint')}</p>
          </div>

          <div>
            <label className={labelClass}>{t('displayNameLabel')}</label>
            <input
              className={inputClass}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('displayNamePlaceholder')}
            />
          </div>

          <div>
            <label className={labelClass}>{t('descriptionLabel')}</label>
            <input
              className={inputClass}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2">
            <button className={btnGhost} onClick={closeCreate}>
              {t('cancel')}
            </button>
            <button
              className={btnPrimary}
              onClick={handleCreate}
              disabled={!isPhoneValid || createConfig.isPending}
            >
              {createConfig.isPending && <Loader2 size={14} className="animate-spin" />}
              {t('create')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
