'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/ui/modal';
import { useChangePassword } from '@/hooks/identity/use-auth';
import { useRouter } from '@/i18n/routing';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  twoFactorEnabled: boolean;
  hasPassword?: boolean;
}

export default function ChangePasswordModal({
  isOpen,
  onClose,
  twoFactorEnabled,
  hasPassword = true,
}: ChangePasswordModalProps) {
  const t = useTranslations('ChangePasswordModal');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code2FA, setCode2FA] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const router = useRouter();
  const queryClient = useQueryClient();
  const changePassword = useChangePassword();

  const handleSubmit = async () => {
    // Validations
    if ((hasPassword && !currentPassword) || !newPassword || !confirmPassword) {
      toast.error(t('allFieldsRequired'));
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error(t('passwordsMismatch'));
      return;
    }

    if (newPassword.length < 8) {
      toast.error(t('passwordTooShort'));
      return;
    }

    if (twoFactorEnabled && (!code2FA || code2FA.length !== 6)) {
      toast.error(t('code2FARequired'));
      return;
    }

    try {
      await changePassword.mutateAsync({
        ...(hasPassword && { currentPassword }),
        newPassword,
        code2FA: twoFactorEnabled ? code2FA : undefined,
      });
      toast.success(t('successToast'));
      handleClose();

      // Clear auth cache immediately to prevent redirection back to dashboard
      // attempting to use stale data
      queryClient.setQueryData(['auth', 'me'], null);
      await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });

      router.push('/login');
    } catch (error: any) {
      toast.error(error.message || t('errorToast'));
    }
  };

  const handleClose = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setCode2FA('');
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={hasPassword ? t('titleChange') : t('titleCreate')}
    >
      <div className="space-y-4">
        {/* Current Password - Only show if user has password */}
        {hasPassword && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-text-primary">
              {t('currentPasswordLabel')}
            </label>
            <div className="relative">
              <input
                type={showCurrentPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={t('currentPasswordPlaceholder')}
                className="w-full rounded-xl border border-input-border bg-input-bg px-4 py-3 pr-12 text-sm text-text-primary outline-none focus:border-input-border-focus focus:ring-4 focus:ring-border-focus/5"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 transition-colors hover:bg-surface-secondary"
              >
                {showCurrentPassword ? (
                  <EyeOff size={18} className="text-text-tertiary" />
                ) : (
                  <Eye size={18} className="text-text-tertiary" />
                )}
              </button>
            </div>
          </div>
        )}

        {/* New Password */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-text-primary">
            {t('newPasswordLabel')}
          </label>
          <div className="relative">
            <input
              type={showNewPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t('newPasswordPlaceholder')}
              className="w-full rounded-xl border border-input-border bg-input-bg px-4 py-3 pr-12 text-sm text-text-primary outline-none focus:border-input-border-focus focus:ring-4 focus:ring-border-focus/5"
            />
            <button
              type="button"
              onClick={() => setShowNewPassword(!showNewPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 transition-colors hover:bg-surface-secondary"
            >
              {showNewPassword ? (
                <EyeOff size={18} className="text-text-tertiary" />
              ) : (
                <Eye size={18} className="text-text-tertiary" />
              )}
            </button>
          </div>
        </div>

        {/* Confirm Password */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-text-primary">
            {t('confirmPasswordLabel')}
          </label>
          <div className="relative">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('confirmPasswordPlaceholder')}
              className="w-full rounded-xl border border-input-border bg-input-bg px-4 py-3 pr-12 text-sm text-text-primary outline-none focus:border-input-border-focus focus:ring-4 focus:ring-border-focus/5"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 transition-colors hover:bg-surface-secondary"
            >
              {showConfirmPassword ? (
                <EyeOff size={18} className="text-text-tertiary" />
              ) : (
                <Eye size={18} className="text-text-tertiary" />
              )}
            </button>
          </div>
        </div>

        {/* 2FA Code (if enabled) */}
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
                  handleSubmit();
                }
              }}
              placeholder={t('codePlaceholder')}
              className="w-full rounded-xl border border-input-border bg-input-bg px-4 py-3 text-center font-mono text-lg tracking-widest text-text-primary outline-none focus:border-input-border-focus focus:ring-4 focus:ring-border-focus/5"
            />
          </div>
        )}

        <div className="flex gap-3 pt-4">
          <button
            onClick={handleClose}
            className="flex-1 rounded-xl bg-surface-secondary px-4 py-3 font-medium text-text-secondary transition-colors hover:bg-surface-elevated"
          >
            {t('cancelButton')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={changePassword.isPending}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 font-medium text-text-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {changePassword.isPending ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                {t('changing')}
              </>
            ) : (
              t('changeButton')
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
