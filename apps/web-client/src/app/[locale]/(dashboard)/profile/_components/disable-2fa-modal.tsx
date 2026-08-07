'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/ui/modal';
import {
  TwoFactorCodeInput,
  isTwoFactorCodeComplete,
} from '@/components/ui/two-factor-code-input';
import { useDisable2FA } from '@/hooks/identity/use-auth';
import { Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface Disable2FAModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Disable2FAModal({ isOpen, onClose }: Disable2FAModalProps) {
  const t = useTranslations('Disable2FAModal');
  const [verificationCode, setVerificationCode] = useState('');
  const queryClient = useQueryClient();
  const disable2FA = useDisable2FA();

  const handleDisable = async () => {
    if (!isTwoFactorCodeComplete(verificationCode)) {
      toast.error(t('codeRequired'));
      return;
    }

    try {
      await disable2FA.mutateAsync(verificationCode);
      // Invalidate user queries to refresh 2FA status
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      toast.success(t('deactivated'));
      handleClose();
    } catch (error: any) {
      toast.error(error.message || t('invalidCode'));
    }
  };

  const handleClose = () => {
    setVerificationCode('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t('title')}>
      <div className="space-y-4">
        <div className="bg-warning-500/10 rounded-xl p-4 text-warning-500">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium">{t('warningHeading')}</p>
              <p className="mt-1 text-sm opacity-90">{t('warningText')}</p>
            </div>
          </div>
        </div>

        <TwoFactorCodeInput
          value={verificationCode}
          onChange={setVerificationCode}
          onSubmit={handleDisable}
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
            onClick={handleDisable}
            disabled={disable2FA.isPending || !isTwoFactorCodeComplete(verificationCode)}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-danger px-4 py-3 font-medium text-brand-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {disable2FA.isPending ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                {t('disabling')}
              </>
            ) : (
              t('disableButton')
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
