'use client';

import { useState } from 'react';
import { useOrganizationMutations } from '@/hooks/useOrganizations';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/modal';
import { Loader2, Mail, Send } from 'lucide-react';

interface InviteUserModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function InviteUserModal({ isOpen, onClose }: InviteUserModalProps) {
  const [email, setEmail] = useState('');
  const { inviteUser } = useOrganizationMutations();

  const getErrorMessage = (error: any): string => {
    const raw: string =
      error?.response?.data?.errors?.[0] ||
      error?.response?.data?.message ||
      error?.message ||
      '';

    const messages: Record<string, string> = {
      USER_ALREADY_REGISTERED: 'Este usuario ya es miembro de la organización.',
      USER_ALREADY_INVITED: 'Ya se envió una invitación a este correo. Puedes reenviarla si es necesario.',
      EMAIL_IN_SINUP_PROGRESS: 'Este correo ya tiene un registro en proceso.',
      INVITE_LIMIT_EXCEEDED: 'Se alcanzó el límite de invitaciones pendientes.',
      ORGANIZATION_NOT_FOUND: 'No se encontró la organización.',
      ORGANIZATION_NOT_VALID: 'La organización no es válida.',
      ERROR_SENDING_EMAIL: 'No se pudo enviar el correo de invitación. Intenta de nuevo.',
      ERROR_CREATING_RECORD: 'Error interno al crear la invitación. Intenta de nuevo.',
      'Formato de correo electrónico inválido': 'El formato del correo electrónico no es válido.',
    };

    return messages[raw] ?? (raw || 'Error al enviar la invitación. Intenta de nuevo.');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast.error('Por favor ingresa un correo electrónico');
      return;
    }

    try {
      await inviteUser.mutateAsync({ email });
      toast.success('Invitación enviada correctamente');
      setEmail('');
      onClose();
    } catch (error: any) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Invitar Usuario">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-black/70 dark:text-white/70">
            Correo Electrónico
          </label>
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-black/30 dark:text-white/30">
              <Mail size={18} />
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ejemplo@empresa.com"
              className="w-full rounded-xl border border-black/10 bg-white py-3 pl-11 pr-4 text-sm text-black outline-none focus:border-black/20 focus:ring-4 focus:ring-black/5 dark:border-white/10 dark:bg-[#141414] dark:text-white dark:focus:border-white/20 dark:focus:ring-white/5"
              autoFocus
              required
            />
          </div>
          <p className="text-xs text-black/50 dark:text-white/50">
            Se enviará un correo con las instrucciones para unirse a la organización.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl bg-black/5 px-4 py-3 font-medium text-black/70 transition-colors hover:bg-black/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={inviteUser.isPending || !email.trim()}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-black px-4 py-3 font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-white dark:text-black"
          >
            {inviteUser.isPending ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                Enviando...
              </>
            ) : (
              <>
                <Send size={18} />
                Enviar Invitación
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
