'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Selección de filas de la rejilla.
 *
 * Vive aquí y no dentro de `RecordsGrid` porque la acción de borrado va junto a la barra de
 * búsqueda, que es de la página: con el estado dentro de la tabla habría que sacarlo por contexto o
 * duplicar la barra dentro de la rejilla.
 */

export interface RecordsSelection {
  selectedIds: Set<string>;
  toggle: (id: string) => void;
  toggleAllVisible: () => void;
  allVisibleSelected: boolean;
  someVisibleSelected: boolean;
}

export interface RecordSelectionState extends RecordsSelection {
  /** Los ids que de verdad se van a borrar. */
  selectedVisibleIds: string[];
  clear: () => void;
}

export function useRecordSelection(visibleIds: string[], resetKey: string): RecordSelectionState {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Cambiar de página o de búsqueda vacía la selección. Arrastrarla sugeriría que "seleccionar
  // todo" abarca el catálogo entero, y abarca solo lo que está en pantalla.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [resetKey]);

  /**
   * Se deriva en vez de guardarse: si un refetch hace desaparecer filas —otra pestaña, o el propio
   * borrado— ningún id fantasma llega al payload ni infla el contador.
   */
  const selectedVisibleIds = useMemo(
    () => visibleIds.filter((id) => selectedIds.has(id)),
    [visibleIds, selectedIds],
  );

  const toggle = useCallback((id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const allVisibleSelected =
    visibleIds.length > 0 && selectedVisibleIds.length === visibleIds.length;

  const toggleAllVisible = useCallback(() => {
    setSelectedIds(allVisibleSelected ? new Set() : new Set(visibleIds));
  }, [allVisibleSelected, visibleIds]);

  const clear = useCallback(() => setSelectedIds(new Set()), []);

  return {
    selectedIds,
    selectedVisibleIds,
    toggle,
    toggleAllVisible,
    allVisibleSelected,
    someVisibleSelected: selectedVisibleIds.length > 0,
    clear,
  };
}
