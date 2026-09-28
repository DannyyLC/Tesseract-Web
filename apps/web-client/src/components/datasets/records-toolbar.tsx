'use client';

import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, Trash2, X } from 'lucide-react';
import { DatasetField } from '@tesseract/types';
import { RecordFiltersState } from './use-record-filters';

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
  /** Con ambos, pinta debajo de la búsqueda un chip por filtro activo para quitarlo de un clic. */
  fields?: DatasetField[];
  filterState?: RecordFiltersState;
}

export function RecordsToolbar({
  search,
  onSearchChange,
  selectedCount,
  onDeleteSelected,
  onClearSelection,
  canDelete,
  fields = [],
  filterState,
}: RecordsToolbarProps) {
  const t = useTranslations('Datasets');

  // Los filtros viven en los encabezados; estos chips son el recordatorio de que la tabla está
  // recortada, que de otro modo solo se vería en un embudo relleno quizá fuera de pantalla.
  const chips = filterState
    ? fields
        .filter((field) => filterState.activeKeys.includes(field.key))
        .map((field) => {
          const values = filterState.filters.select[field.key];
          const range = filterState.filters.range[field.key];
          const summary = values?.length
            ? values.join(', ')
            : [
                range?.min && t('filterFrom', { value: range.min }),
                range?.max && t('filterTo', { value: range.max }),
              ]
                .filter(Boolean)
                .join(' ');
          return { field, summary };
        })
    : [];

  return (
    <div className="space-y-3">
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

      {filterState && chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map(({ field, summary }) => (
            <span
              key={field.key}
              className="inline-flex max-w-full items-center gap-1 rounded-lg border border-border bg-surface py-1 pl-2.5 pr-1 text-xs text-text-primary"
            >
              <span className="truncate">
                <span className="text-text-secondary">{field.label}:</span> {summary}
              </span>
              <button
                type="button"
                onClick={() => filterState.clearField(field.key)}
                aria-label={t('filterClear')}
                className="rounded-md p-0.5 text-text-tertiary hover:bg-[var(--surface-tint)] hover:text-text-primary"
              >
                <X size={12} />
              </button>
            </span>
          ))}
          {chips.length > 1 && (
            <button
              type="button"
              onClick={filterState.clearAll}
              className="rounded-lg px-2 py-1 text-xs font-medium text-text-secondary hover:bg-[var(--surface-tint)]"
            >
              {t('clearFilters')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
