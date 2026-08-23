'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { DashboardEndUserDto } from '@tesseract/types';
import { Modal } from '@/components/ui/modal';
import { useEndUserMutations } from '@/hooks/identity/use-end-users';

interface EditContactModalProps {
  /** Contacto a renombrar. `null` mantiene el modal cerrado. */
  contact: DashboardEndUserDto | null;
  onClose: () => void;
}

const MAX_NAME_LENGTH = 200;

/**
 * Renombra un contacto. Es el único campo editable: el teléfono, el email y el externalId son
 * la identidad del contacto en su canal, y tocarlos rompería el match con sus mensajes.
 */
export function EditContactModal({ contact, onClose }: EditContactModalProps) {
  const t = useTranslations('Contacts');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { updateEndUser } = useEndUserMutations();

  useEffect(() => {
    if (contact) {
      setName(contact.name ?? '');
      setError(null);
    }
  }, [contact]);

  const handleSubmit = async () => {
    if (!contact) return;

    const trimmed = name.trim();
    if (!trimmed) {
      setError(t('editNameRequired'));
      return;
    }

    setError(null);

    try {
      await updateEndUser.mutateAsync({ id: contact.id, data: { name: trimmed } });
      toast.success(t('editSuccess'));
      onClose();
    } catch (err: any) {
      const backendMessage = typeof err?.message === 'string' ? err.message : '';
      toast.error(backendMessage || t('editError'));
    }
  };

  return (
    <Modal isOpen={Boolean(contact)} onClose={onClose} title={t('editModalTitle')}>
      <div className="space-y-4">
        <div>
          <label htmlFor="contact-name" className="mb-1.5 block text-sm font-medium text-text-primary">
            {t('editNameLabel')}
          </label>
          <input
            id="contact-name"
            type="text"
            autoFocus
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleSubmit();
            }}
            maxLength={MAX_NAME_LENGTH}
            placeholder={t('editNamePlaceholder')}
            className="focus:ring-border-focus/10 w-full rounded-xl border-none bg-surface-secondary px-4 py-2.5 text-sm text-text-primary transition-all placeholder:text-input-placeholder focus:outline-none focus:ring-2"
          />
          {error && <p className="mt-1 text-xs font-medium text-danger">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            disabled={updateEndUser.isPending}
            className="rounded-full px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-50"
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={updateEndUser.isPending}
            className="flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-medium text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {updateEndUser.isPending && <Loader2 size={14} className="animate-spin" />}
            {t('editSubmit')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
