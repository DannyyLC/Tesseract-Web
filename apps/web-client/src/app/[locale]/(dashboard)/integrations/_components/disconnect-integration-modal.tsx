'use client';

import { useState } from 'react';
import { Loader2, TriangleAlert } from 'lucide-react';
import { Modal } from '@/components/ui/modal';

interface DisconnectIntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  toolDisplayName: string;
  onConfirm: () => Promise<void>;
}

export function DisconnectIntegrationModal({
  isOpen,
  onClose,
  toolDisplayName,
  onConfirm,
}: DisconnectIntegrationModalProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={isLoading ? () => {} : onClose} title="Desconectar integración">
      <div className="space-y-5">
        {/* Warning banner */}
        <div className="flex gap-3 rounded-xl border border-[var(--danger-banner-border)] bg-[var(--danger-banner-bg)] p-4">
          <TriangleAlert
            size={18}
            className="mt-0.5 flex-shrink-0 text-[var(--danger-text-adaptive)]"
          />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-[var(--badge-danger-text-solid)]">
              Acción irreversible con impacto en producción
            </p>
            <p className="text-xs leading-relaxed text-[var(--danger-text-adaptive)]">
              Al desconectar <span className="font-semibold">"{toolDisplayName}"</span>, sus
              credenciales serán eliminadas de forma permanente. Cualquier agente o workflow que
              dependa de esta integración{' '}
              <span className="font-semibold">fallará inmediatamente</span> al intentar utilizarla.
            </p>
          </div>
        </div>

        {/* Explanation */}
        <div className="space-y-3 text-sm text-text-secondary">
          <p>
            Los agentes de Tesseract utilizan las integracións conectadas como base para ejecutar
            sus tareas. Si un agente necesita{' '}
            <strong className="text-text-primary">"{toolDisplayName}"</strong> y esta
            no está disponible:
          </p>
          <ul className="ml-4 list-disc space-y-1 text-xs leading-relaxed">
            <li>Las ejecuciones de workflows asociados terminarán en error.</li>
            <li>
              Si la integración es central para el agente, este dejará de funcionar por completo.
            </li>
            <li>Los workflows afectados no se recuperarán solos; requerirán reconexión manual.</li>
          </ul>
          <p className="text-xs font-medium text-text-secondary">
            Solo procede si estás seguro de que esta integración no está en uso, o si asumes
            conscientemente que los workflows que la utilizan dejarán de funcionar.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 border-t border-[var(--border-subtle)] pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 rounded-xl bg-[var(--surface-tint)] px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-[var(--surface-tint-md)] disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isLoading}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-danger-600 px-4 py-2.5 text-sm font-semibold text-brand-white transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {isLoading ?? <Loader2 size={14} className="animate-spin" />}
            Sí, desconectar
          </button>
        </div>
      </div>
    </Modal>
  );
}
