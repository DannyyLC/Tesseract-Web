'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ApiKeyListDto } from '@tesseract/types';
import { useApiKeyMutations } from '@/hooks/identity/use-api-key';
import { Modal } from '@/components/ui/modal';

interface DeleteApiKeyModalProps {
  /** La key a eliminar. `null` mantiene el modal cerrado. */
  apiKey: ApiKeyListDto | null;
  onClose: () => void;
}

export function DeleteApiKeyModal({ apiKey, onClose }: DeleteApiKeyModalProps) {
  const t = useTranslations('ApiKeys');
  const { deleteApiKey } = useApiKeyMutations();

  const handleDelete = async () => {
    if (!apiKey) return;

    try {
      await deleteApiKey.mutateAsync(apiKey.id);
      onClose();
      toast.success(t('deleteSuccess'));
    } catch {
      toast.error(t('deleteError'));
    }
  };

  return (
    <Modal isOpen={Boolean(apiKey)} onClose={onClose} title={t('deleteModalTitle')}>
      <div className="space-y-4">
        <div className="bg-danger/10 flex items-center gap-3 rounded-xl p-4 text-danger-600">
          <AlertTriangle size={24} />
          <p className="text-sm font-medium">{t('deleteWarning')}</p>
        </div>

        <p className="text-center text-sm text-text-secondary">
          {t('deleteConfirmBefore')} <strong>{apiKey?.name}</strong>
          {t('deleteConfirmAfter')}
        </p>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl bg-surface-secondary px-4 py-2 font-medium text-text-primary transition-colors hover:bg-surface-elevated"
          >
            {t('cancelButton')}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleteApiKey.isPending}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-danger px-4 py-2 font-medium text-brand-white transition-colors hover:bg-danger-600 disabled:opacity-50"
          >
            {deleteApiKey.isPending ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              t('confirmDeleteButton')
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
