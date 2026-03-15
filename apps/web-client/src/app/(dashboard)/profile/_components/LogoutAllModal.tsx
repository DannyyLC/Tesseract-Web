'use client';

import { Modal } from '@/components/ui/modal';
import { useLogoutAll } from '@/hooks/useAuth';
import { Loader2, MonitorX } from 'lucide-react';
import { toast } from 'sonner';

interface LogoutAllModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LogoutAllModal({ isOpen, onClose }: LogoutAllModalProps) {
  const logoutAll = useLogoutAll();

  const handleLogoutAll = async () => {
    try {
      await logoutAll.mutateAsync();
      toast.success('Se han cerrado todas las sesiones correctamente');
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Error al cerrar las sesiones');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Cerrar todas las sesiones">
      <div className="space-y-4">
        <div className="rounded-xl bg-orange-500/10 p-4 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400">
          <div className="flex gap-3">
            <MonitorX className="h-5 w-5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium">¿Estás seguro?</p>
              <p className="mt-1 text-sm opacity-90">
                Esta acción cerrará tu sesión actual y todas las sesiones activas en otros
                dispositivos. Tendrás que volver a iniciar sesión.
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl bg-black/5 px-4 py-3 font-medium text-black/70 transition-colors hover:bg-black/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10"
          >
            Cancelar
          </button>
          <button
            onClick={handleLogoutAll}
            disabled={logoutAll.isPending}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-black px-4 py-3 font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {logoutAll.isPending ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                Cerrando...
              </>
            ) : (
              'Cerrar sesiones'
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
