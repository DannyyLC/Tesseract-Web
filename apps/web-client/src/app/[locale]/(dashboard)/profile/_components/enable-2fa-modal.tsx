'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/ui/modal';
import { BackupCodesPanel } from '@/components/ui/backup-codes-panel';
import { CopyButton } from '@/components/ui/copy-button';
import { TwoFactorCodeInput } from '@/components/ui/two-factor-code-input';
import { useSetup2FA, useEnable2FA } from '@/hooks/identity/use-auth';
import { Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';

interface Enable2FAModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** 1: explicación · 2: escanear y verificar · 3: guardar códigos de respaldo. */
type Step = 1 | 2 | 3;

export default function Enable2FAModal({ isOpen, onClose }: Enable2FAModalProps) {
  const t = useTranslations('Enable2FAModal');
  const [step, setStep] = useState<Step>(1);
  const [qrCode, setQrCode] = useState<string>('');
  const [secret, setSecret] = useState<string>('');
  const [verificationCode, setVerificationCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [codesSaved, setCodesSaved] = useState(false);

  const queryClient = useQueryClient();
  const setup2FA = useSetup2FA();
  const enable2FA = useEnable2FA();

  const handleSetup = async () => {
    try {
      const response = await setup2FA.mutateAsync(undefined);

      if (response.data?.qr) {
        setQrCode(response.data.qr);
        setSecret(response.data.secret ?? '');
        setStep(2);
      } else {
        toast.error(t('noQrError'));
      }
    } catch (error: any) {
      toast.error(error.message || t('setupError'));
    }
  };

  const handleVerify = async () => {
    if (verificationCode.length !== 6) {
      toast.error(t('codeRequired'));
      return;
    }

    try {
      const response = await enable2FA.mutateAsync(verificationCode);
      // Invalidate user queries to refresh 2FA status
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      toast.success(t('activated'));

      // Los códigos solo llegan aquí: si no se muestran ahora, se pierden.
      setBackupCodes(response.data?.backupCodes ?? []);
      setStep(3);
    } catch (error: any) {
      toast.error(error.message || t('invalidCode'));
    }
  };

  const handleClose = () => {
    setStep(1);
    setQrCode('');
    setSecret('');
    setVerificationCode('');
    setBackupCodes([]);
    setCodesSaved(false);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={step === 3 ? () => undefined : handleClose}
      title={t('title')}
      size={step === 3 ? 'lg' : 'md'}
    >
      {step === 1 && (
        <div className="space-y-4">
          <div className="bg-info-500/10 rounded-xl p-4 text-info-500">
            <div className="flex gap-3">
              <ShieldCheck className="h-5 w-5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">{t('infoHeading')}</p>
                <p className="mt-1 text-sm opacity-90">{t('infoText')}</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-text-primary">{t('appInstallNote')}</p>
            <ul className="list-inside list-disc space-y-1 text-sm text-text-secondary">
              <li>Google Authenticator</li>
              <li>Microsoft Authenticator</li>
              <li>Authy</li>
              <li>1Password</li>
            </ul>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={handleClose}
              className="flex-1 rounded-xl bg-surface-secondary px-4 py-3 font-medium text-text-secondary transition-colors hover:bg-surface-elevated"
            >
              {t('cancelButton')}
            </button>
            <button
              onClick={handleSetup}
              disabled={setup2FA.isPending}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 font-medium text-text-inverse transition-opacity hover:opacity-90"
            >
              {setup2FA.isPending ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  {t('settingUp')}
                </>
              ) : (
                t('continueButton')
              )}
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="space-y-3">
            <p className="text-sm font-medium text-text-primary">{t('step1Title')}</p>
            {qrCode && (
              <div className="flex justify-center rounded-xl bg-white p-4">
                <div className="relative h-48 w-48">
                  <Image
                    src={qrCode}
                    alt="QR Code para 2FA"
                    fill
                    className="object-contain"
                    unoptimized
                  />
                </div>
              </div>
            )}
          </div>

          {secret && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-text-primary">{t('manualCode')}</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded-lg bg-surface-secondary px-3 py-2 font-mono text-sm text-text-primary">
                  {secret}
                </code>
                <CopyButton
                  text={secret}
                  title={t('copyCode')}
                  successMessage={t('codeCopied')}
                  size={18}
                  className="rounded-lg bg-surface-secondary p-2 text-text-secondary transition-colors hover:bg-surface-elevated"
                />
              </div>
            </div>
          )}

          {/* En el alta no se admite código de respaldo: todavía no existe ninguno. */}
          <TwoFactorCodeInput
            value={verificationCode}
            onChange={setVerificationCode}
            onSubmit={handleVerify}
            label={t('step2Title')}
            allowBackupCode={false}
          />

          <div className="flex gap-3 pt-4">
            <button
              onClick={handleClose}
              className="flex-1 rounded-xl bg-surface-secondary px-4 py-3 font-medium text-text-secondary transition-colors hover:bg-surface-elevated"
            >
              {t('cancelButton')}
            </button>
            <button
              onClick={handleVerify}
              disabled={enable2FA.isPending || verificationCode.length !== 6}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 font-medium text-text-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {enable2FA.isPending ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  {t('verifying')}
                </>
              ) : (
                t('activateButton')
              )}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <BackupCodesPanel codes={backupCodes} />

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
      )}
    </Modal>
  );
}
