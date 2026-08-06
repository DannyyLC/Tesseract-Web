'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';

interface CopyButtonProps {
  /** Texto que se copia al portapapeles. */
  text: string;
  className?: string;
  /** Tooltip del botón. */
  title?: string;
  /** Mensaje del toast de confirmación. */
  successMessage?: string;
  /** Etiqueta junto al icono. Sin ella el botón queda solo con el icono. */
  label?: string;
  /** Etiqueta mientras dura la confirmación. */
  copiedLabel?: string;
  size?: number;
}

/**
 * Botón de copiar con confirmación temporal.
 *
 * Confirma durante 2s y vuelve al estado inicial, para que se pueda copiar
 * varias veces seguidas sin recargar.
 */
export const CopyButton = ({
  text,
  className = '',
  title,
  successMessage,
  label,
  copiedLabel,
  size = 14,
}: CopyButtonProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (successMessage) toast.success(successMessage);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // navigator.clipboard falla en contextos no seguros (http sin localhost).
      if (successMessage) toast.error(successMessage);
    }
  };

  return (
    <button type="button" onClick={handleCopy} className={className} title={title}>
      {copied ? (
        <div className="flex items-center gap-1.5 text-success-500">
          <Check size={size} />
          {(copiedLabel ?? label) && (
            <span className="text-xs font-medium">{copiedLabel ?? label}</span>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <Copy size={size} />
          {label && <span className="text-xs font-medium">{label}</span>}
        </div>
      )}
    </button>
  );
};
