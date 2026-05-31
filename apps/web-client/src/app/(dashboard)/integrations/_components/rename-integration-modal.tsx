'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { useTenantToolMutations } from '@/hooks/automation/use-tenant-tools';
import { toast } from 'sonner';

interface RenameIntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  toolId: string;
  currentName: string;
}

export function RenameIntegrationModal({ isOpen, onClose, toolId, currentName }: RenameIntegrationModalProps) {
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
    <Modal isOpen={isOpen} onClose={onClose} title="Renombrar integración">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary">Nombre</label>
          <input
            autoFocus
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={80}
            className="w-full rounded-xl border border-border bg-[var(--surface-subtle)] px-4 py-2.5 text-sm text-text-primary outline-none transition-all focus:border-[var(--border-subtle)] focus:ring-2 focus:ring-[var(--border-subtle)]"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl bg-[var(--surface-tint)] px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-[var(--surface-tint-md)]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={updateTenantTool.isPending || !displayName.trim()}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-text-inverse transition-opacity hover:opacity-80 disabled:opacity-40"
          >
            {updateTenantTool.isPending && <Loader2 size={14} className="animate-spin" />}
            Guardar
          </button>
        </div>
      </form>
    </Modal>
  );
}
