'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CursorPagerProps {
  prevCursor: string | null;
  nextCursor: string | null;
  nextPageAvailable: boolean;
  onNavigate: (cursor: string, action: 'next' | 'prev') => void;
  prevLabel: string;
  nextLabel: string;
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
}: CursorPagerProps) {
  // Sin páginas a los lados no hay nada que ofrecer.
  if (!prevCursor && !nextPageAvailable) return null;

  return (
    <div className="flex items-center justify-end gap-2 pt-2">
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
    </div>
  );
}
