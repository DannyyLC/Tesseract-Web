'use client';

import { useState } from 'react';
import { Loader2, TriangleAlert } from 'lucide-react';
import { Modal } from '@/components/ui/modal';

interface DisconnectCredentialsToolModalProps {
  isOpen: boolean;
  onClose: () => void;
  toolDisplayName: string;
  onConfirm: () => Promise<void>;
}

export function DisconnectCredentialsToolModal({
  isOpen,
  onClose,
  toolDisplayName,
  onConfirm,
}: DisconnectCredentialsToolModalProps) {
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
    <Modal isOpen={isOpen} onClose={isLoading ? () => {} : onClose} title="Desconectar herramienta">
      <div className="space-y-5">
        {/* Warning banner */}
        <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/40">
          <TriangleAlert
            size={18}
            className="mt-0.5 flex-shrink-0 text-red-600 dark:text-red-400"
          />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">
              Acción irreversible con impacto en producción
            </p>
            <p className="text-xs leading-relaxed text-red-600/80 dark:text-red-400/80">
              Al desconectar <span className="font-semibold">"{toolDisplayName}"</span>, sus
              credenciales serán eliminadas de forma permanente. Cualquier agente o workflow que
              dependa de esta herramienta{' '}
              <span className="font-semibold">fallará inmediatamente</span> al intentar utilizarla.
            </p>
          </div>
        </div>

        {/* Explanation */}
        <div className="space-y-3 text-sm text-black/60 dark:text-white/60">
          <p>
            Los agentes de Tesseract utilizan las herramientas conectadas como base para ejecutar
            sus tareas. Si un agente necesita <strong className="text-black/80 dark:text-white/80">"{toolDisplayName}"</strong> y esta no está disponible:
          </p>
          <ul className="ml-4 list-disc space-y-1 text-xs leading-relaxed">
            <li>Las ejecuciones de workflows asociados terminarán en error.</li>
            <li>Si la herramienta es central para el agente, este dejará de funcionar por completo.</li>
            <li>Los workflows afectados no se recuperarán solos; requerirán reconexión manual.</li>
          </ul>
          <p className="text-xs font-medium text-black/50 dark:text-white/50">
            Solo procede si estás seguro de que esta herramienta no está en uso, o si asumes
            conscientemente que los workflows que la utilizan dejarán de funcionar.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 border-t border-black/5 pt-4 dark:border-white/5">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 rounded-xl bg-black/5 px-4 py-2.5 text-sm font-medium text-black transition-colors hover:bg-black/10 disabled:opacity-40 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isLoading}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {isLoading ?? (
              <Loader2 size={14} className="animate-spin" />
            )}
            Sí, desconectar
          </button>
        </div>
      </div>
    </Modal>
  );
}
