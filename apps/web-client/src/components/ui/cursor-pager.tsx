'use client';

import { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PageSizeSelect } from './page-size-select';

interface CursorPagerProps {
  prevCursor: string | null;
  nextCursor: string | null;
  nextPageAvailable: boolean;
  onNavigate: (cursor: string, action: 'next' | 'prev') => void;
  prevLabel: string;
  nextLabel: string;
  /**
   * Texto al centro, del tipo «Mostrando 20 elementos». Con `summary` los botones se separan a los
   * extremos; sin él quedan pegados a la derecha, que es la forma original.
   */
  summary?: ReactNode;
  /** Para la variante con separador superior (`border-t border-border pt-4`). */
  className?: string;
  /**
   * Tamaño de página actual y su cambio. Con `onPageSizeChange` se muestra el selector, y se muestra
   * aunque no haya páginas a los lados: si no, quien subió a 100 y cabe todo en una sola página no
   * podría volver a bajar.
   */
  pageSize?: number;
  onPageSizeChange?: (pageSize: number) => void;
}

/**
 * Anterior/Siguiente sobre el cursor de un listado.
 *
 * Las etiquetas llegan por prop en vez de resolverse aquí porque el componente lo comparten
 * secciones con namespaces de traducción distintos.
 */
export function CursorPager({
  prevCursor,
  nextCursor,
  nextPageAvailable,
  onNavigate,
  prevLabel,
  nextLabel,
  summary,
  className = '',
  pageSize,
  onPageSizeChange,
}: CursorPagerProps) {
  const showPageSize = pageSize !== undefined && !!onPageSizeChange;
  const hasNavigation = !!prevCursor || nextPageAvailable;

  // Sin páginas a los lados ni selector no hay nada que ofrecer.
  if (!hasNavigation && !showPageSize) return null;

  return (
    <div
      className={`flex items-center gap-2 pt-2 ${summary ? 'justify-between' : 'justify-end'} ${className}`}
    >
      {summary && <span className="text-xs text-text-tertiary">{summary}</span>}

      <div className="flex items-center gap-2">
        {showPageSize && <PageSizeSelect value={pageSize} onChange={onPageSizeChange} />}
        {hasNavigation && (
          <>
            <button
              onClick={() => prevCursor && onNavigate(prevCursor, 'prev')}
              disabled={!prevCursor}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-text-secondary transition-all hover:bg-[var(--surface-tint)] hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={14} />
              {prevLabel}
            </button>
            <button
              onClick={() => nextCursor && onNavigate(nextCursor, 'next')}
              disabled={!nextPageAvailable || !nextCursor}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-text-secondary transition-all hover:bg-[var(--surface-tint)] hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
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
