'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Power } from 'lucide-react';
import { toast } from 'sonner';
import { ApiKeyListDto } from '@tesseract/types';
import { useApiKeyMutations } from '@/hooks/identity/use-api-key';
import { Modal } from '@/components/ui/modal';

interface EditApiKeyModalProps {
  /** La key a editar. `null` mantiene el modal cerrado. */
  apiKey: ApiKeyListDto | null;
  onClose: () => void;
}

export function EditApiKeyModal({ apiKey, onClose }: EditApiKeyModalProps) {
  const t = useTranslations('ApiKeys');
  const { updateApiKey } = useApiKeyMutations();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (apiKey) {
      setName(apiKey.name);
      setDescription(apiKey.description ?? '');
      setIsActive(apiKey.isActive);
    }
  }, [apiKey]);

  const handleUpdate = async () => {
    if (!apiKey || !name.trim()) return;

    try {
      await updateApiKey.mutateAsync({
        id: apiKey.id,
        data: { name, description, isActive },
      });
      onClose();
      toast.success(t('updateSuccess'));
    } catch {
      toast.error(t('updateError'));
    }
  };

  return (
    <Modal isOpen={Boolean(apiKey)} onClose={onClose} title={t('editModalTitle')}>
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-text-primary">
            {t('nameLabel')}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface-secondary px-4 py-2 text-text-primary transition-colors focus:border-border-hover focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-text-primary">
            {t('descriptionEditLabel')}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-xl border border-border bg-surface-secondary px-4 py-2 text-text-primary transition-colors focus:border-border-hover focus:outline-none"
          />
        </div>

        <div className="py-2">
          <div className="flex items-center justify-between rounded-xl border border-border p-3">
            <div className="flex items-center gap-3">
              <div
                className={`rounded-lg p-2 ${isActive ? 'bg-success-500/10 text-success-500' : 'bg-surface-secondary text-text-tertiary'}`}
              >
                <Power size={18} />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">{t('statusLabel')}</p>
                <p className="text-xs text-text-secondary">
                  {isActive ? t('keyActive') : t('keyInactive')}
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isActive}
              aria-label={t('statusLabel')}
              onClick={() => setIsActive(!isActive)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                isActive ? 'bg-success-500' : 'bg-border-hover'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-surface-elevated transition-transform ${
                  isActive ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl bg-surface-secondary px-4 py-2 font-medium text-text-primary transition-colors hover:bg-surface-elevated"
          >
            {t('cancelButton')}
          </button>
          <button
            onClick={handleUpdate}
            disabled={updateApiKey.isPending || !name.trim()}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 font-medium text-text-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {updateApiKey.isPending ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              t('saveButton')
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
