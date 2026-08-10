'use client';

import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ApiKeysPagerProps {
  prevCursor: string | null;
  nextCursor: string | null;
  nextPageAvailable: boolean;
  onNavigate: (cursor: string, action: 'next' | 'prev') => void;
}

/**
 * Anterior/Siguiente sobre el cursor del listado, con el mismo comportamiento que la
 * tabla de ejecuciones del workflow.
 */
export function ApiKeysPager({
  prevCursor,
  nextCursor,
  nextPageAvailable,
  onNavigate,
}: ApiKeysPagerProps) {
  const t = useTranslations('ApiKeys');

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
        {t('prev')}
      </button>
      <button
        onClick={() => nextCursor && onNavigate(nextCursor, 'next')}
        disabled={!nextPageAvailable || !nextCursor}
        className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-text-secondary transition-all hover:bg-[var(--surface-tint)] hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t('next')}
        <ChevronRight size={14} />
      </button>
    </div>
  );
}
