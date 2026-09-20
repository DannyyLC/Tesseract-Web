'use client';

import { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PageSizeSelect } from './page-size-select';

/**
 * Anterior/Siguiente sobre páginas numeradas, para los listados que devuelven `meta.totalPages` en
 * vez de un cursor. Hermano de `CursorPager`: existe porque los dos modelos de paginación no se
 * pueden servir con un solo componente sin acabar en props que se excluyen entre sí.
 *
 * `page` es **1-indexed, sin excepciones**. No hay una opción para el 0-index: sería una bandera que
 * cambia el significado de otras dos props, y es justo lo que produce el error de una unidad en la
 * siguiente pantalla que se copie del ejemplo equivocado. Quien lleve el estado en base 0 lo
 * convierte en su propio `onPageChange`.
 */

/** Con borde, como los botones del panel admin. `plain` es el de las tablas embebidas. */
type PagerEmphasis = 'bordered' | 'plain';

// `bordered` es `btnGhost` (app/[locale]/admin/_styles.ts) con menos padding. Se duplica la cadena
// a propósito: `components/ui` no debe importar de `app/`.
const BUTTON_CLASSES: Record<PagerEmphasis, string> = {
  bordered:
    'inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-[var(--surface-tint)] hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40',
  plain:
    'inline-flex items-center gap-1 rounded-lg px-3 py-1 text-sm text-text-secondary transition-colors hover:bg-[var(--surface-tint)] hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40',
};

interface PagePagerProps {
  /** Página actual, contando desde 1. */
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /**
   * Texto de la izquierda, **ya formateado** por quien lo usa: «Página 3 de 12 · 240 organizaciones».
   * Se recibe hecho, y no como una colección de banderas, porque el sustantivo y el idioma los sabe
   * la pantalla que lista, no el componente. Omitido, se muestra `3 / 12`.
   */
  summary?: ReactNode;
  prevLabel?: string;
  nextLabel?: string;
  emphasis?: PagerEmphasis;
  className?: string;
  /**
   * Tamaño de página actual y su cambio. Con `onPageSizeChange` se muestra el selector, y se muestra
   * aunque haya una sola página: si no, quien subió a 100 no podría volver a bajar.
   */
  pageSize?: number;
  onPageSizeChange?: (pageSize: number) => void;
}

export function PagePager({
  page,
  totalPages,
  onPageChange,
  summary,
  prevLabel = 'Anterior',
  nextLabel = 'Siguiente',
  emphasis = 'bordered',
  className = '',
  pageSize,
  onPageSizeChange,
}: PagePagerProps) {
  const showPageSize = pageSize !== undefined && !!onPageSizeChange;
  const hasNavigation = totalPages > 1;

  // Con una sola página y sin selector no hay nada que ofrecer.
  if (!hasNavigation && !showPageSize) return null;

  const buttonClass = BUTTON_CLASSES[emphasis];

  return (
    <div className={`flex items-center justify-between gap-2 ${className}`}>
      <span className="text-sm text-text-tertiary">{summary ?? `${page} / ${totalPages}`}</span>

      <div className="flex items-center gap-2">
        {showPageSize && <PageSizeSelect value={pageSize} onChange={onPageSizeChange} />}
        {hasNavigation && (
          <>
            <button
              type="button"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className={buttonClass}
            >
              <ChevronLeft size={14} />
              {prevLabel}
            </button>
            <button
              type="button"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className={buttonClass}
            >
              {nextLabel}
              <ChevronRight size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
