'use client';

import { Check, Minus } from 'lucide-react';

/**
 * Casilla de selección.
 *
 * El `<input>` nativo se esconde en vez de reemplazarse: así el foco, el teclado y la semántica de
 * casilla siguen siendo los del navegador, y lo único propio es el recuadro pintado. Un `<div>` con
 * `onClick` se vería igual y no sería operable sin ratón.
 *
 * Monocromática a propósito: usa `accent`, que es negro en tema claro y blanco en oscuro, así que
 * la marca siempre contrasta contra el fondo sin introducir un color nuevo a la paleta.
 */

interface CheckboxProps {
  checked: boolean;
  /** Algunas de las filas, no todas: se pinta un guion en vez de la palomita. */
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  'aria-label': string;
  title?: string;
}

export function Checkbox({
  checked,
  indeterminate,
  onChange,
  disabled,
  title,
  'aria-label': ariaLabel,
}: CheckboxProps) {
  const marked = checked || indeterminate;

  return (
    <label
      title={title}
      className={`inline-flex items-center ${disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span
        aria-hidden
        className={`flex size-4 shrink-0 items-center justify-center rounded border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-[var(--surface)] ${
          marked ? 'border-accent bg-accent' : 'border-border'
        }`}
      >
        {indeterminate ? (
          <Minus size={12} className="text-text-inverse" />
        ) : (
          checked && <Check size={12} className="text-text-inverse" />
        )}
      </span>
    </label>
  );
}
