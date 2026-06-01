'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, TriangleAlert } from 'lucide-react';
import { Modal } from '@/components/ui/modal';

interface DeleteIntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  toolDisplayName: string;
  onConfirm: () => Promise<void>;
}

export function DeleteIntegrationModal({
  isOpen,
  onClose,
  toolDisplayName,
  onConfirm,
}: DeleteIntegrationModalProps) {
  const t = useTranslations('Integrations');
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={isLoading ? () => {} : onClose} title={t('deleteModalTitle')}>
      <div className="space-y-5">
        {/* Warning banner */}
        <div className="flex gap-3 rounded-xl border border-[var(--danger-banner-border)] bg-[var(--danger-banner-bg)] p-4">
          <TriangleAlert
            size={18}
            className="mt-0.5 flex-shrink-0 text-[var(--danger-text-adaptive)]"
          />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-[var(--badge-danger-text-solid)]">
              {t('deleteIrreversibleWarning')}
            </p>
            <p className="text-xs leading-relaxed text-[var(--danger-text-adaptive)]">
              {t('deleteWarning1', { name: toolDisplayName })}
            </p>
          </div>
        </div>

        {/* Explanation */}
        <div className="space-y-3 text-sm text-text-secondary">
          <p>{t('deleteImpactTitle', { name: toolDisplayName })}</p>
          <ul className="ml-4 list-disc space-y-1 text-xs leading-relaxed">
            <li>{t('deleteBullet1')}</li>
            <li>{t('deleteBullet2')}</li>
            <li>{t('deleteBullet3')}</li>
          </ul>
          <p className="text-xs font-medium text-text-secondary">{t('deleteNote')}</p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 border-t border-[var(--border-subtle)] pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 rounded-xl bg-[var(--surface-tint)] px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-[var(--surface-tint-md)] disabled:opacity-40"
          >
            {t('cancelButton')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isLoading}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-danger-600 px-4 py-2.5 text-sm font-semibold text-brand-white transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {isLoading ?? <Loader2 size={14} className="animate-spin" />}
            {t('confirmDisconnect')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
