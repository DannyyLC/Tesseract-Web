'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { useTenantToolMutations } from '@/hooks/tools/useTenantTools';
import { toast } from 'sonner';

interface RenameToolModalProps {
  isOpen: boolean;
  onClose: () => void;
  toolId: string;
  currentName: string;
}

export function RenameToolModal({ isOpen, onClose, toolId, currentName }: RenameToolModalProps) {
  const [displayName, setDisplayName] = useState(currentName);
  const { updateTenantTool } = useTenantToolMutations();

  // Sync input when the modal opens with a different tool
  useEffect(() => {
    if (isOpen) setDisplayName(currentName);
  }, [isOpen, currentName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (!trimmed || trimmed === currentName) {
      onClose();
      return;
    }
    try {
      await updateTenantTool.mutateAsync({ id: toolId, data: { displayName: trimmed } });
      toast.success('Nombre actualizado correctamente.');
      onClose();
    } catch {
      toast.error('No se pudo actualizar el nombre. Intenta de nuevo.');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Renombrar herramienta">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-black/50 dark:text-white/50">
            Nombre
          </label>
          <input
            autoFocus
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={80}
            className="w-full rounded-xl border border-black/10 bg-black/[0.03] px-4 py-2.5 text-sm text-black outline-none transition-all focus:border-black/20 focus:ring-2 focus:ring-black/5 dark:border-white/10 dark:bg-white/[0.03] dark:text-white dark:focus:border-white/20 dark:focus:ring-white/5"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl bg-black/5 px-4 py-2.5 text-sm font-medium text-black transition-colors hover:bg-black/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={updateTenantTool.isPending || !displayName.trim()}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-40 dark:bg-white dark:text-black"
          >
            {updateTenantTool.isPending && <Loader2 size={14} className="animate-spin" />}
            Guardar
          </button>
        </div>
      </form>
    </Modal>
  );
}
