'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, ShieldBan } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { useEndUserMutations } from '@/hooks/identity/use-end-users';

interface BlockContactModalProps {
  /** Id del contacto a bloquear. `null` mantiene el modal cerrado. */
  endUserId: string | null;
  /** Con qué nombre se le conoce: teléfono, nombre o identificador del canal. */
  contactLabel: string;
  onClose: () => void;
  onBlocked?: () => void;
}

const MAX_REASON_LENGTH = 500;

/**
 * Confirmación de bloqueo, con el motivo.
 *
 * Se comparte entre la página de Contactos y la conversación: son los dos sitios desde donde
 * se bloquea, y la advertencia de lo que implica tiene que decir lo mismo en ambos.
 *
 * El motivo es opcional a propósito. Obligarlo llena la columna de "x" y "spam", que no le
 * dicen nada a quien revise la lista tres meses después.
 */
export function BlockContactModal({
  endUserId,
  contactLabel,
  onClose,
  onBlocked,
}: BlockContactModalProps) {
  const t = useTranslations('Contacts');
  const [reason, setReason] = useState('');
  const { blockEndUser } = useEndUserMutations();

  // El motivo no se arrastra de un contacto al siguiente: sería fácil bloquear a alguien con
  // la justificación de otro sin darse cuenta.
  useEffect(() => {
    if (endUserId) setReason('');
  }, [endUserId]);

  const handleBlock = async () => {
    if (!endUserId) return;

    await blockEndUser.mutateAsync({ id: endUserId, data: { reason: reason.trim() || undefined } });
    onBlocked?.();
    onClose();
  };

  return (
    <Modal isOpen={Boolean(endUserId)} onClose={onClose} title={t('blockModalTitle')}>
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl bg-[var(--badge-danger-bg)] p-3">
          <ShieldBan size={18} className="mt-0.5 shrink-0 text-[var(--badge-danger-text)]" />
          <p className="text-sm text-text-secondary">
            {t.rich('blockModalWarning', {
              contact: contactLabel,
              strong: (chunks) => (
                <span className="font-semibold text-text-primary">{chunks}</span>
              ),
            })}
          </p>
        </div>

        <div>
          <label htmlFor="block-reason" className="mb-1.5 block text-sm font-medium text-text-primary">
            {t('blockModalReasonLabel')}
          </label>
          <textarea
            id="block-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={MAX_REASON_LENGTH}
            rows={3}
            placeholder={t('blockModalReasonPlaceholder')}
            className="focus:ring-border-focus/10 w-full resize-none rounded-xl border-none bg-surface-secondary px-4 py-2.5 text-sm text-text-primary transition-all placeholder:text-input-placeholder focus:outline-none focus:ring-2"
          />
          <p className="mt-1 text-xs text-text-tertiary">{t('blockModalReasonHint')}</p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            disabled={blockEndUser.isPending}
            className="rounded-full px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-50"
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleBlock}
            disabled={blockEndUser.isPending}
            className="flex items-center gap-2 rounded-full bg-danger-600 px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {blockEndUser.isPending && <Loader2 size={14} className="animate-spin" />}
            {t('blockAction')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
