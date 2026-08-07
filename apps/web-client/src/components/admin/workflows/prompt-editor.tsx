'use client';

import { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  minRows?: number;
}

/**
 * Textarea para system prompts.
 *
 * Es el motivo de todo este editor: dentro del JSON el prompt es una sola línea con
 * `\n` escapados, imposible de leer. Aquí se ve como texto, monoespaciado, creciendo
 * con el contenido y con opción de pantalla completa para los prompts largos.
 */
export function PromptEditor({
  value,
  onChange,
  label = 'system_prompt',
  placeholder,
  minRows = 12,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [expanded, setExpanded] = useState(false);

  // Autoexpansión: la altura sigue al contenido en vez de dejar una barra interna.
  useEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, minRows * 20)}px`;
  }, [value, expanded, minRows]);

  const chars = value?.length ?? 0;
  const lines = value ? value.split('\n').length : 0;

  return (
    <div className={expanded ? 'fixed inset-0 z-[80] flex flex-col bg-surface p-4' : ''}>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-xs font-medium text-text-secondary">{label}</label>
        <div className="flex items-center gap-3">
          <span className="text-[11px] tabular-nums text-text-secondary">
            {chars.toLocaleString('es')} caracteres · {lines} líneas
          </span>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded p-1 text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
            title={expanded ? 'Salir de pantalla completa' : 'Pantalla completa'}
          >
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      <textarea
        ref={ref}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className={`w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs leading-relaxed text-text-primary outline-none focus:border-border-focus ${
          expanded ? 'flex-1' : ''
        }`}
      />
    </div>
  );
}
