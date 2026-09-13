'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Modal } from './modal';

type ConfirmVariant = 'danger' | 'warning';

/**
 * El fondo del banner sale de un token adaptativo y no de `bg-danger/10`: los colores de la paleta
 * se declaran como `var(--danger-500)`, y Tailwind 3 no puede sacarles los canales para aplicarles
 * alfa, así que esa utilidad nunca llegó a generarse y el banner quedaba sin fondo.
 */
const VARIANT_CLASSES: Record<ConfirmVariant, { banner: string; icon: string; button: string }> = {
  danger: {
    banner:
      'border border-[var(--danger-banner-border)] bg-[var(--danger-banner-bg)] text-[var(--danger-text-adaptive)]',
    icon: 'text-[var(--danger-text-adaptive)]',
    button: 'bg-danger hover:bg-danger-600',
  },
  warning: {
    banner: 'bg-[var(--badge-warning-bg-solid)] text-[var(--badge-warning-text-solid)]',
    icon: 'text-[var(--badge-warning-text-solid)]',
    button: 'bg-warning-600 hover:bg-warning-700',
  },
};

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` para acciones destructivas (eliminar); `warning` para avisos previos a algo reversible. */
  variant?: ConfirmVariant;
}

/**
 * Reemplaza `window.confirm`. No es solo estética: los diálogos nativos no heredan el
 * tema (se ven rotos en oscuro), no se pueden traducir de forma consistente con el resto
 * de la UI y varios navegadores permiten silenciarlos tras el segundo seguido, así que una
 * confirmación "crítica" se puede saltar sin que el usuario la lea.
 */
export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'warning',
}: ConfirmModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const classes = VARIANT_CLASSES[variant];

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={isLoading ? () => undefined : onClose} title={title}>
      <div className="space-y-4">
        <div className={`flex items-start gap-3 rounded-xl p-4 ${classes.banner}`}>
          <AlertTriangle size={20} className={`mt-0.5 shrink-0 ${classes.icon}`} />
          <p className="text-sm font-medium">{message}</p>
        </div>

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 rounded-xl bg-surface-secondary px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-elevated disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isLoading}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-brand-white transition-colors disabled:opacity-50 ${classes.button}`}
          >
            {isLoading ? <Loader2 className="animate-spin" size={16} /> : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
