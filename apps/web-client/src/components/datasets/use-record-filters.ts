'use client';

import { useCallback, useMemo, useState } from 'react';
import { DatasetField, DatasetRangeFilter } from '@tesseract/types';

/**
 * Filtros por columna y orden de la rejilla de filas.
 *
 * Es el mismo lenguaje que usa el agente (`select` exacto, `range` por mínimo y máximo): el
 * listado los manda a `DatasetQueryService`, así que la tabla muestra justo lo que el bot vería.
 * Los rangos se guardan como texto, tal como salen del input, y se convierten al serializar.
 */

export interface RangeDraft {
  min?: string;
  max?: string;
}

export interface RecordFilters {
  select: Record<string, string[]>;
  range: Record<string, RangeDraft>;
}

const EMPTY: RecordFilters = { select: {}, range: {} };

/** Qué columnas admiten filtro: las de texto ya las cubre la búsqueda libre. */
export const isFilterable = (field: DatasetField) => field.type !== 'text';

export const isRangeActive = (range?: RangeDraft) => !!range && (!!range.min || !!range.max);

export function isFilterActive(filters: RecordFilters, key: string): boolean {
  return (filters.select[key]?.length ?? 0) > 0 || isRangeActive(filters.range[key]);
}

function serialize(fields: DatasetField[], filters: RecordFilters): string | undefined {
  const byKey = new Map(fields.map((field) => [field.key, field]));
  const select = Object.fromEntries(
    Object.entries(filters.select).filter(([, values]) => values.length > 0),
  );

  const range: Record<string, DatasetRangeFilter> = {};
  for (const [key, draft] of Object.entries(filters.range)) {
    if (!isRangeActive(draft)) continue;
    const isNumber = byKey.get(key)?.type === 'number';
    const bound = (value?: string) =>
      value ? (isNumber ? Number(value) : value) : undefined;
    range[key] = { min: bound(draft.min), max: bound(draft.max) };
  }

  if (Object.keys(select).length === 0 && Object.keys(range).length === 0) return undefined;
  return JSON.stringify({ select, range });
}

export function useRecordFilters(fields: DatasetField[] = []) {
  const [filters, setFilters] = useState<RecordFilters>(EMPTY);
  const [sortBy, setSortBy] = useState<string | undefined>();

  const setSelect = useCallback((key: string, values: string[]) => {
    setFilters((current) => ({ ...current, select: { ...current.select, [key]: values } }));
  }, []);

  const setRange = useCallback((key: string, range: RangeDraft) => {
    setFilters((current) => ({ ...current, range: { ...current.range, [key]: range } }));
  }, []);

  const clearField = useCallback((key: string) => {
    setFilters((current) => {
      const select = { ...current.select };
      const range = { ...current.range };
      delete select[key];
      delete range[key];
      return { select, range };
    });
  }, []);

  const clearAll = useCallback(() => setFilters(EMPTY), []);

  /** Ascendente → descendente → sin orden (vuelve al orden de captura). */
  const toggleSort = useCallback((key: string) => {
    setSortBy((current) => (current === key ? `-${key}` : current === `-${key}` ? undefined : key));
  }, []);

  const serialized = useMemo(() => serialize(fields, filters), [fields, filters]);
  const activeKeys = fields.filter((field) => isFilterActive(filters, field.key)).map((f) => f.key);

  return {
    filters,
    setSelect,
    setRange,
    clearField,
    clearAll,
    sortBy,
    toggleSort,
    /** Lo que viaja en `?filters=`; `undefined` sin filtros activos. */
    serialized,
    activeKeys,
  };
}

export type RecordFiltersState = ReturnType<typeof useRecordFilters>;
