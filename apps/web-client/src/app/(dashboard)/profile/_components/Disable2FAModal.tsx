'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { useDisable2FA } from '@/hooks/useAuth';
import { Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface Disable2FAModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Disable2FAModal({ isOpen, onClose }: Disable2FAModalProps) {
  const [verificationCode, setVerificationCode] = useState('');
  const queryClient = useQueryClient();
  const disable2FA = useDisable2FA();

  const handleDisable = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      toast.error('Por favor ingresa un código de 6 dígitos');
      return;
    }

    try {
      await disable2FA.mutateAsync(verificationCode);
      // Invalidate user queries to refresh 2FA status
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      toast.success('2FA desactivado correctamente');
      handleClose();
    } catch (error: any) {
      toast.error(error.message || 'Código inválido. Intenta nuevamente');
    }
  };

  const handleClose = () => {
    setVerificationCode('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Desactivar Autenticación de Dos Factores">
      <div className="space-y-4">
        <div className="rounded-xl bg-yellow-500/10 p-4 text-yellow-600 dark:bg-yellow-500/20 dark:text-yellow-400">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium">Advertencia de Seguridad</p>
              <p className="mt-1 text-sm opacity-90">
                Al desactivar 2FA, tu cuenta será menos segura. Solo necesitarás tu contraseña para
                iniciar sesión.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-black/70 dark:text-white/70">
            Ingresa el código de 6 dígitos de tu aplicación de autenticación
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
            placeholder="000000"
            className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-center font-mono text-lg tracking-widest text-black outline-none focus:border-black/20 focus:ring-4 focus:ring-black/5 dark:border-white/10 dark:bg-[#141414] dark:text-white dark:focus:border-white/20 dark:focus:ring-white/5"
          />
        </div>

        <div className="flex gap-3 pt-4">
          <button
            onClick={handleClose}
            className="flex-1 rounded-xl bg-black/5 px-4 py-3 font-medium text-black/70 transition-colors hover:bg-black/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10"
          >
            Cancelar
          </button>
          <button
            onClick={handleDisable}
            disabled={disable2FA.isPending || verificationCode.length !== 6}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-3 font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {disable2FA.isPending ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                Desactivando...
              </>
            ) : (
              'Desactivar 2FA'
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
