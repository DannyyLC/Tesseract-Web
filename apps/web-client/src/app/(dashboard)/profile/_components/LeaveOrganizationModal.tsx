'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { useUserMutations } from '@/hooks/useUsers';
import { useRouter } from 'next/navigation';
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
  const [confirmationText, setConfirmationText] = useState('');
  const [code2FA, setCode2FA] = useState('');
  const router = useRouter();
  const { leaveOrganization } = useUserMutations();

  const handleLeave = async () => {
    if (confirmationText !== organizationName) {
      toast.error(`Por favor escribe exactamente "${organizationName}" para confirmar`);
      return;
    }

    if (twoFactorEnabled && (!code2FA || code2FA.length !== 6)) {
      toast.error('Por favor ingresa el código 2FA de 6 dígitos');
      return;
    }

    try {
      await leaveOrganization.mutateAsync({
        confirmationText,
        code2FA: twoFactorEnabled ? code2FA : undefined,
      });
      toast.success('Has salido de la organización');
      // Redirect to login after leaving
      router.push('/login');
    } catch (error: any) {
      toast.error(error.message || 'Error al salir de la organización');
    }
  };

  const handleClose = () => {
    setConfirmationText('');
    setCode2FA('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Salir de la Organización">
      <div className="space-y-4">
        <div className="rounded-xl bg-red-500/10 p-4 text-red-600 dark:bg-red-500/20 dark:text-red-400">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium">Advertencia: Esta acción es irreversible</p>
              <p className="mt-1 text-sm opacity-90">
                Al salir de la organización perderás acceso inmediato a todos los recursos,
                workflows, conversaciones y datos. Esta acción no se puede deshacer.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-black/70 dark:text-white/70">
            Escribe <strong>{organizationName}</strong> para confirmar
          </label>
          <input
            type="text"
            value={confirmationText}
            onChange={(e) => setConfirmationText(e.target.value)}
            placeholder={organizationName}
            className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none focus:border-black/20 focus:ring-4 focus:ring-black/5 dark:border-white/10 dark:bg-[#141414] dark:text-white dark:focus:border-white/20 dark:focus:ring-white/5"
          />
        </div>

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
                  handleLeave();
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
            className="flex-1 rounded-2xl bg-black/5 px-4 py-1 font-medium text-black/70 transition-colors hover:bg-black/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10"
          >
            Cancelar
          </button>
          <button
            onClick={handleLeave}
            disabled={
              leaveOrganization.isPending ||
              confirmationText !== organizationName ||
              (twoFactorEnabled && code2FA.length !== 6)
            }
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-red-500 px-4 py-1 font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            title={
              confirmationText !== organizationName
                ? `Escribe "${organizationName}" para habilitar`
                : twoFactorEnabled && code2FA.length !== 6
                  ? 'Ingresa el código 2FA'
                  : ''
            }
          >
            {leaveOrganization.isPending ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                Saliendo...
              </>
            ) : (
              'Salir de la Organización'
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
