'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/ui/modal';
import { BackupCodesPanel } from '@/components/ui/backup-codes-panel';
import {
  TwoFactorCodeInput,
  isTwoFactorCodeComplete,
} from '@/components/ui/two-factor-code-input';
import { useRegenerateBackupCodes } from '@/hooks/identity/use-auth';
import { Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface RegenerateBackupCodesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function RegenerateBackupCodesModal({
  isOpen,
  onClose,
}: RegenerateBackupCodesModalProps) {
  const t = useTranslations('BackupCodes');
  const [code2FA, setCode2FA] = useState('');
  const [newCodes, setNewCodes] = useState<string[]>([]);
  const [codesSaved, setCodesSaved] = useState(false);

  const regenerate = useRegenerateBackupCodes();

  const handleRegenerate = async () => {
    if (!isTwoFactorCodeComplete(code2FA)) {
      toast.error(t('codeRequired'));
      return;
    }

    try {
      const response = await regenerate.mutateAsync(code2FA);
      setNewCodes(response.data?.backupCodes ?? []);
      toast.success(t('regeneratedToast'));
    } catch (error: any) {
      toast.error(error.message || t('invalidCode'));
    }
  };

  const handleClose = () => {
    setCode2FA('');
    setNewCodes([]);
    setCodesSaved(false);
    onClose();
  };

  const showingCodes = newCodes.length > 0;

  return (
    <Modal
      isOpen={isOpen}
      // Una vez emitidos, los códigos anteriores ya no sirven: cerrar sin
      // guardarlos dejaría al usuario sin ninguno válido.
      onClose={showingCodes ? () => undefined : handleClose}
      title={t('regenerateTitle')}
      size={showingCodes ? 'lg' : 'md'}
    >
      {showingCodes ? (
        <div className="space-y-4">
          <BackupCodesPanel codes={newCodes} />

          <label className="flex cursor-pointer items-start gap-3 text-sm text-text-primary">
            <input
              type="checkbox"
              checked={codesSaved}
              onChange={(e) => setCodesSaved(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
            />
            <span>{t('codesSavedConfirm')}</span>
          </label>

          <button
            onClick={handleClose}
            disabled={!codesSaved}
            className="w-full rounded-xl bg-accent px-4 py-3 font-medium text-text-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('finishButton')}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-3 rounded-xl bg-warning-500/10 p-4 text-warning-500">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium">{t('regenerateWarningHeading')}</p>
              <p className="mt-1 text-sm opacity-90">{t('regenerateWarningText')}</p>
            </div>
          </div>

          <TwoFactorCodeInput
            value={code2FA}
            onChange={setCode2FA}
            onSubmit={handleRegenerate}
            label={t('codeLabel')}
          />

          <div className="flex gap-3 pt-4">
            <button
              onClick={handleClose}
              className="flex-1 rounded-xl bg-surface-secondary px-4 py-3 font-medium text-text-secondary transition-colors hover:bg-surface-elevated"
            >
              {t('cancelButton')}
            </button>
            <button
              onClick={handleRegenerate}
              disabled={regenerate.isPending || !isTwoFactorCodeComplete(code2FA)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 font-medium text-text-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {regenerate.isPending ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  {t('regenerating')}
                </>
              ) : (
                t('regenerateButton')
              )}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
