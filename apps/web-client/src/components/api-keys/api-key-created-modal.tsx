'use client';

import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { CopyButton } from '@/components/ui/copy-button';
import { Modal } from '@/components/ui/modal';

interface ApiKeyCreatedModalProps {
  /** Token en claro. El backend solo lo devuelve al crear, así que esta es la única vez que se ve. */
  token: string | null;
  onClose: () => void;
}

export function ApiKeyCreatedModal({ token, onClose }: ApiKeyCreatedModalProps) {
  const t = useTranslations('ApiKeys');

  return (
    <Modal isOpen={Boolean(token)} onClose={onClose} title={t('createdModalTitle')}>
      <div className="space-y-4">
        <div className="bg-success-500/10 flex items-start gap-3 rounded-xl p-4 text-success-600">
          <Check className="mt-0.5 shrink-0" size={18} />
          <p className="text-sm">{t('createdWarning')}</p>
        </div>

        <div className="relative">
          <div className="w-full break-all rounded-xl border border-border bg-surface-secondary p-4 pr-12 font-mono text-sm text-text-primary">
            {token}
          </div>
          <CopyButton
            text={token ?? ''}
            title={t('copyTitle')}
            successMessage={t('copiedToast')}
            copiedLabel={t('copied')}
            className="absolute right-2 top-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-text-primary shadow-sm transition-transform hover:scale-105"
          />
        </div>

        <button
          onClick={onClose}
          className="w-full rounded-xl bg-accent px-4 py-2 font-medium text-text-inverse transition-opacity hover:opacity-90"
        >
          {t('acknowledgeButton')}
        </button>
      </div>
    </Modal>
  );
}
