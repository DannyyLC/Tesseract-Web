'use client';

interface SwitchProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: string;
  hint?: string;
  disabled?: boolean;
  id?: string;
}

/**
 * Interruptor on/off.
 *
 * Dos detalles que importan y que es fácil equivocar:
 *
 * - La bolita cambia de color con el estado. Dejarla siempre en `surface` la volvía
 *   invisible apagada, porque `--surface` (#fff en claro) y `--surface-secondary`
 *   (#f5f5f5) son casi el mismo color; en oscuro pasaba igual (#0a0a0a sobre #171717).
 *   Apagada usa `text-secondary`, que contrasta con el track en ambos temas.
 * - El borde está SIEMPRE presente. Ponerlo solo en un estado cambiaba el box model
 *   entre encendido y apagado y hacía que el recorrido se viera desalineado.
 */
export function Switch({ checked, onChange, label, hint, disabled, id }: SwitchProps) {
  const control = (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'border-accent bg-accent' : 'border-border bg-surface-secondary'
      }`}
    >
      <span
        className={`pointer-events-none h-3.5 w-3.5 rounded-full transition-transform duration-200 ${
          checked ? 'translate-x-[18px] bg-surface' : 'translate-x-[3px] bg-text-secondary'
        }`}
      />
    </button>
  );

  if (!label) return control;

  return (
    <div className="flex items-start gap-3">
      {control}
      <div className="min-w-0">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className="block text-left text-sm text-text-primary disabled:cursor-not-allowed"
        >
          {label}
        </button>
        {hint && <span className="block text-xs text-text-secondary">{hint}</span>}
      </div>
    </div>
  );
}
