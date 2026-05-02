'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { useChangePassword } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
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
      toast.error('Por favor completa todos los campos');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('Las contraseñas no coinciden');
      return;
    }

    if (newPassword.length < 8) {
      toast.error('La nueva contraseña debe tener al menos 8 caracteres');
      return;
    }

    if (twoFactorEnabled && (!code2FA || code2FA.length !== 6)) {
      toast.error('Por favor ingresa el código 2FA de 6 dígitos');
      return;
    }

    try {
      await changePassword.mutateAsync({
        ...(hasPassword && { currentPassword }),
        newPassword,
        code2FA: twoFactorEnabled ? code2FA : undefined,
      });
      toast.success('Contraseña actualizada. Por favor inicia sesión nuevamente');
      handleClose();

      // Clear auth cache immediately to prevent redirection back to dashboard
      // attempting to use stale data
      queryClient.setQueryData(['auth', 'me'], null);
      await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });

      router.push('/login');
    } catch (error: any) {
      toast.error(error.message || 'Error al cambiar la contraseña');
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
      title={hasPassword ? 'Cambiar Contraseña' : 'Crear Contraseña'}
    >
      <div className="space-y-4">
        {/* Current Password - Only show if user has password */}
        {hasPassword && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-black/70 dark:text-white/70">
              Contraseña Actual
            </label>
            <div className="relative">
              <input
                type={showCurrentPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Ingresa tu contraseña actual"
                className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 pr-12 text-sm text-black outline-none focus:border-black/20 focus:ring-4 focus:ring-black/5 dark:border-white/10 dark:bg-[#141414] dark:text-white dark:focus:border-white/20 dark:focus:ring-white/5"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              >
                {showCurrentPassword ? (
                  <EyeOff size={18} className="text-black/40 dark:text-white/40" />
                ) : (
                  <Eye size={18} className="text-black/40 dark:text-white/40" />
                )}
              </button>
            </div>
          </div>
        )}

        {/* New Password */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-black/70 dark:text-white/70">
            Nueva Contraseña
          </label>
          <div className="relative">
            <input
              type={showNewPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 pr-12 text-sm text-black outline-none focus:border-black/20 focus:ring-4 focus:ring-black/5 dark:border-white/10 dark:bg-[#141414] dark:text-white dark:focus:border-white/20 dark:focus:ring-white/5"
            />
            <button
              type="button"
              onClick={() => setShowNewPassword(!showNewPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
            >
              {showNewPassword ? (
                <EyeOff size={18} className="text-black/40 dark:text-white/40" />
              ) : (
                <Eye size={18} className="text-black/40 dark:text-white/40" />
              )}
            </button>
          </div>
        </div>

        {/* Confirm Password */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-black/70 dark:text-white/70">
            Confirmar Nueva Contraseña
          </label>
          <div className="relative">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repite la nueva contraseña"
              className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 pr-12 text-sm text-black outline-none focus:border-black/20 focus:ring-4 focus:ring-black/5 dark:border-white/10 dark:bg-[#141414] dark:text-white dark:focus:border-white/20 dark:focus:ring-white/5"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
            >
              {showConfirmPassword ? (
                <EyeOff size={18} className="text-black/40 dark:text-white/40" />
              ) : (
                <Eye size={18} className="text-black/40 dark:text-white/40" />
              )}
            </button>
          </div>
        </div>

        {/* 2FA Code (if enabled) */}
        {twoFactorEnabled && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-black/70 dark:text-white/70">
              Código 2FA
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
              placeholder="000000"
              className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-center font-mono text-lg tracking-widest text-black outline-none focus:border-black/20 focus:ring-4 focus:ring-black/5 dark:border-white/10 dark:bg-[#141414] dark:text-white dark:focus:border-white/20 dark:focus:ring-white/5"
            />
          </div>
        )}

        <div className="flex gap-3 pt-4">
          <button
            onClick={handleClose}
            className="flex-1 rounded-xl bg-black/5 px-4 py-3 font-medium text-black/70 transition-colors hover:bg-black/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={changePassword.isPending}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-black px-4 py-3 font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {changePassword.isPending ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                Cambiando...
              </>
            ) : (
              'Cambiar Contraseña'
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
