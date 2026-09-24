'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { Check, ChevronDown } from 'lucide-react';
import { PAGE_SIZE_OPTIONS, sanitizePageSize } from '@tesseract/types';

interface PageSizeSelectProps {
  value: number;
  onChange: (pageSize: number) => void;
  className?: string;
}

/** Separación entre el disparador y el panel. */
const GAP = 4;

/**
 * Selector de cuántas filas mostrar por página.
 *
 * Es un dropdown propio y no un `<select>` porque el menú de un `<select>` lo pinta el navegador y
 * no hereda los colores del tema. Las opciones salen de `PAGE_SIZE_OPTIONS`: agregar un tamaño ahí
 * lo agrega en todos los listados, y ninguno puede ser rechazado por el servidor.
 *
 * El panel va en un portal con posición fija para que ningún contenedor con `overflow-hidden` lo
 * recorte, y abre hacia arriba cuando abajo no cabe (los paginadores suelen estar al pie).
 */
export function PageSizeSelect({ value, onChange, className = '' }: PageSizeSelectProps) {
  const t = useTranslations('Shared.PageSize');
  const [isOpen, setIsOpen] = useState(false);
  const [panel, setPanel] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);

  const close = useCallback(() => setIsOpen(false), []);

  // Se posiciona antes de pintar para que el panel no aparezca un instante en (0, 0).
  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const panelHeight = PAGE_SIZE_OPTIONS.length * 36 + 8;
    const fitsBelow = window.innerHeight - rect.bottom >= panelHeight + GAP;
    setPanel(
      fitsBelow
        ? { left: rect.left, top: rect.bottom + GAP }
        : { left: rect.left, bottom: window.innerHeight - rect.top + GAP },
    );
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    // Con posición fija, el panel se quedaría flotando si la página se desplaza.
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [isOpen, close]);

  const select = (size: number) => {
    close();
    // Volver a elegir el mismo tamaño no debe reiniciar el listado a la primera página.
    if (size !== value) onChange(sanitizePageSize(size));
    triggerRef.current?.focus();
  };

  return (
    <div className={`flex items-center gap-2 text-xs text-text-tertiary ${className}`}>
      <span>{t('label')}</span>

      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={t('label')}
        onClick={() => setIsOpen((open) => !open)}
        className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text-primary outline-none transition-colors hover:bg-[var(--surface-tint)] focus-visible:border-border-focus"
      >
        {value}
        <ChevronDown
          size={14}
          className={`shrink-0 text-text-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen &&
        panel &&
        createPortal(
          <ul
            ref={panelRef}
            role="listbox"
            aria-label={t('label')}
            style={{ left: panel.left, top: panel.top, bottom: panel.bottom }}
            className="fixed z-[200] min-w-[4.5rem] overflow-hidden rounded-xl border border-border bg-surface-elevated py-1 shadow-lg"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <li key={size} role="option" aria-selected={size === value}>
                <button
                  type="button"
                  onClick={() => select(size)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs text-text-primary transition-colors hover:bg-surface-secondary"
                >
                  <span className={size === value ? 'font-semibold' : ''}>{size}</span>
                  {size === value && <Check size={14} className="shrink-0 text-accent" />}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}
