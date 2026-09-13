'use client';

import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, Trash2 } from 'lucide-react';

/**
 * Búsqueda de filas y acciones sobre la selección.
 *
 * Las dos cosas van juntas porque el borrado en lote tiene que estar donde el usuario ya está
 * mirando cuando filtra y marca filas. El bloque de la derecha aparece solo cuando hay algo
 * seleccionado, animado para que el resto de la barra no salte.
 */

interface RecordsToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  selectedCount: number;
  onDeleteSelected: () => void;
  onClearSelection: () => void;
  /** `false` para un rol de solo lectura: ni contador ni acciones. */
  canDelete: boolean;
}

export function RecordsToolbar({
  search,
  onSearchChange,
  selectedCount,
  onDeleteSelected,
  onClearSelection,
  canDelete,
}: RecordsToolbarProps) {
  const t = useTranslations('Datasets');

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative max-w-sm sm:flex-1">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
        />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t('searchPlaceholder')}
          className="w-full rounded-xl border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text-primary outline-none focus:border-accent"
        />
      </div>

      <AnimatePresence>
        {canDelete && selectedCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="flex flex-wrap items-center gap-3"
          >
            <span className="text-sm text-text-secondary">
              {t('selectedCount', { count: selectedCount })}
            </span>

            <button
              type="button"
              onClick={onClearSelection}
              className="rounded-lg px-2 py-1 text-xs font-medium text-text-secondary hover:bg-[var(--surface-tint)]"
            >
              {t('clearSelection')}
            </button>

            <button
              type="button"
              onClick={onDeleteSelected}
              className="flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-danger-600 transition-colors hover:bg-[var(--danger-tint-hover)]"
            >
              <Trash2 size={14} />
              {t('deleteSelected')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
