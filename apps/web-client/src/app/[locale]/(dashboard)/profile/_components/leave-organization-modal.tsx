'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/ui/modal';
import { useUserMutations } from '@/hooks/identity/use-users';
import { useRouter } from '@/i18n/routing';
import { Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface LeaveOrganizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  twoFactorEnabled: boolean;
  organizationName: string;
}

export default function LeaveOrganizationModal({
  isOpen,
  onClose,
  twoFactorEnabled,
  organizationName,
}: LeaveOrganizationModalProps) {
  const t = useTranslations('LeaveOrganizationModal');
  const [confirmationText, setConfirmationText] = useState('');
  const [code2FA, setCode2FA] = useState('');
  const router = useRouter();
  const { leaveOrganization } = useUserMutations();

  const handleLeave = async () => {
    if (confirmationText !== organizationName) {
      toast.error(t('confirmExactly', { name: organizationName }));
      return;
    }

    if (twoFactorEnabled && (!code2FA || code2FA.length !== 6)) {
      toast.error(t('code2FARequired'));
      return;
    }

    try {
      await leaveOrganization.mutateAsync({
        confirmationText,
        code2FA: twoFactorEnabled ? code2FA : undefined,
      });
      toast.success(t('successToast'));
      // Redirect to login after leaving
      router.push('/login');
    } catch (error: any) {
      toast.error(error.message || t('errorToast'));
    }
  };

  const handleClose = () => {
    setConfirmationText('');
    setCode2FA('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t('title')}>
      <div className="space-y-4">
        <div className="bg-danger-500/10 rounded-xl p-4 text-danger-500">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium">{t('warningHeading')}</p>
              <p className="mt-1 text-sm opacity-90">{t('warningText')}</p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-text-primary">
            {t('confirmLabelPrefix')} <strong>{organizationName}</strong> {t('confirmLabelSuffix')}
          </label>
          <input
            type="text"
            value={confirmationText}
            onChange={(e) => setConfirmationText(e.target.value)}
            placeholder={organizationName}
            className="focus:ring-border-focus/5 w-full rounded-xl border border-input-border bg-input-bg px-4 py-3 text-sm text-text-primary outline-none focus:border-input-border-focus focus:ring-4"
          />
        </div>

        {twoFactorEnabled && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-text-primary">
              {t('code2FALabel')}
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code2FA}
              onChange={(e) => setCode2FA(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && code2FA.length === 6) {
                  handleLeave();
                }
              }}
              placeholder={t('codePlaceholder')}
              className="focus:ring-border-focus/5 w-full rounded-xl border border-input-border bg-input-bg px-4 py-3 text-center font-mono text-lg tracking-widest text-text-primary outline-none focus:border-input-border-focus focus:ring-4"
            />
          </div>
        )}

        <div className="flex gap-3 pt-4">
          <button
            onClick={handleClose}
            className="flex-1 rounded-2xl bg-surface-secondary px-4 py-1 font-medium text-text-secondary transition-colors hover:bg-surface-elevated"
          >
            {t('cancelButton')}
          </button>
          <button
            onClick={handleLeave}
            disabled={
              leaveOrganization.isPending ||
              confirmationText !== organizationName ||
              (twoFactorEnabled && code2FA.length !== 6)
            }
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-danger px-4 py-1 font-medium text-brand-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            title={
              confirmationText !== organizationName
                ? t('enableButtonHint', { name: organizationName })
                : twoFactorEnabled && code2FA.length !== 6
                  ? t('enter2FACode')
                  : ''
            }
          >
            {leaveOrganization.isPending ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                {t('leaving')}
              </>
            ) : (
              t('leaveButton')
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
