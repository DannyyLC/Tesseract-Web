'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { useSetup2FA, useEnable2FA } from '@/hooks/identity/use-auth';
import { Loader2, ShieldCheck, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';

interface Enable2FAModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Enable2FAModal({ isOpen, onClose }: Enable2FAModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [qrCode, setQrCode] = useState<string>('');
  const [secret, setSecret] = useState<string>('');
  const [verificationCode, setVerificationCode] = useState('');
  const [copiedSecret, setCopiedSecret] = useState(false);

  const queryClient = useQueryClient();
  const setup2FA = useSetup2FA();
  const enable2FA = useEnable2FA();

  const handleSetup = async () => {
    try {
      const response = await setup2FA.mutateAsync();

      if (response.data) {
        const qrCode = response.data.qr || response.data.qrCode;
        const secret = response.data.secret || '';

        if (qrCode) {
          setQrCode(qrCode);
          setSecret(secret);
          setStep(2);
        } else {
          toast.error('Error: No se recibió el código QR del servidor');
        }
      } else {
        toast.error('Error: No se recibió información del servidor');
      }
    } catch (error: any) {
      toast.error(error.message || 'Error al configurar 2FA');
    }
  };

  const handleVerify = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      toast.error('Por favor ingresa un código de 6 dígitos');
      return;
    }

    try {
      await enable2FA.mutateAsync(verificationCode);
      // Invalidate user queries to refresh 2FA status
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      toast.success('2FA activado correctamente');
      handleClose();
    } catch (error: any) {
      toast.error(error.message || 'Código inválido');
    }
  };

  const handleCopySecret = () => {
    navigator.clipboard.writeText(secret);
    setCopiedSecret(true);
    toast.success('Código copiado al portapapeles');
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const handleClose = () => {
    setStep(1);
    setQrCode('');
    setSecret('');
    setVerificationCode('');
    setCopiedSecret(false);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Activar Autenticación de Dos Factores">
      {step === 1 ? (
        <div className="space-y-4">
          <div className="rounded-xl bg-info-500/10 p-4 text-info-500">
            <div className="flex gap-3">
              <ShieldCheck className="h-5 w-5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Protege tu cuenta</p>
                <p className="mt-1 text-sm opacity-90">
                  La autenticación de dos factores agrega una capa extra de seguridad a tu cuenta.
                  Necesitarás una aplicación de autenticación como Google Authenticator o Authy.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-text-primary">
              Antes de continuar, asegúrate de tener instalada una aplicación de autenticación en tu
              dispositivo móvil.
            </p>
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
              Cancelar
            </button>
            <button
              onClick={handleSetup}
              disabled={setup2FA.isPending}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 font-medium text-text-inverse transition-opacity hover:opacity-90"
            >
              {setup2FA.isPending ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  Configurando...
                </>
              ) : (
                'Continuar'
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-3">
            <p className="text-sm font-medium text-text-primary">
              Paso 1: Escanea el código QR con tu aplicación de autenticación
            </p>
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
              <p className="text-sm font-medium text-text-primary">
                O ingresa este código manualmente:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg bg-surface-secondary px-3 py-2 font-mono text-sm text-text-primary">
                  {secret}
                </code>
                <button
                  onClick={handleCopySecret}
                  className="rounded-lg bg-surface-secondary p-2 transition-colors hover:bg-surface-elevated"
                  title="Copiar código"
                >
                  {copiedSecret ? (
                    <Check size={18} className="text-success-500" />
                  ) : (
                    <Copy size={18} className="text-text-secondary" />
                  )}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-medium text-text-primary">
              Paso 2: Ingresa el código de 6 dígitos de tu aplicación
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && verificationCode.length === 6) {
                  handleVerify();
                }
              }}
              placeholder="000000"
              className="w-full rounded-xl border border-input-border bg-input-bg px-4 py-3 text-center font-mono text-lg tracking-widest text-text-primary outline-none focus:border-input-border-focus focus:ring-4 focus:ring-border-focus/5"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={handleClose}
              className="flex-1 rounded-xl bg-surface-secondary px-4 py-3 font-medium text-text-secondary transition-colors hover:bg-surface-elevated"
            >
              Cancelar
            </button>
            <button
              onClick={handleVerify}
              disabled={enable2FA.isPending || verificationCode.length !== 6}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 font-medium text-text-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {enable2FA.isPending ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  Verificando...
                </>
              ) : (
                'Activar 2FA'
              )}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
