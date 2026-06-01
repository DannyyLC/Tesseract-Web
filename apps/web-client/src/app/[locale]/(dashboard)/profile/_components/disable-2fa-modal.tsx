'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/ui/modal';
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
    if (!verificationCode || verificationCode.length !== 6) {
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
        <div className="rounded-xl bg-warning-500/10 p-4 text-warning-500">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium">{t('warningHeading')}</p>
              <p className="mt-1 text-sm opacity-90">
                {t('warningText')}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-text-primary">
            {t('codeLabel')}
          </label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && verificationCode.length === 6) {
                handleDisable();
              }
            }}
            placeholder={t('codePlaceholder')}
            className="w-full rounded-xl border border-input-border bg-input-bg px-4 py-3 text-center font-mono text-lg tracking-widest text-text-primary outline-none focus:border-input-border-focus focus:ring-4 focus:ring-border-focus/5"
          />
        </div>

        <div className="flex gap-3 pt-4">
          <button
            onClick={handleClose}
            className="flex-1 rounded-xl bg-surface-secondary px-4 py-3 font-medium text-text-secondary transition-colors hover:bg-surface-elevated"
          >
            {t('cancelButton')}
          </button>
          <button
            onClick={handleDisable}
            disabled={disable2FA.isPending || verificationCode.length !== 6}
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
