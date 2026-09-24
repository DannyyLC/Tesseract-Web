import { useCallback, useSyncExternalStore } from 'react';
import { DEFAULT_PAGE_SIZE, sanitizePageSize } from '@tesseract/types';

const STORAGE_PREFIX = 'tesseract:page-size:';

const listeners = new Set<() => void>();
// Respaldo para cuando localStorage no deja escribir (modo privado, datos bloqueados): la elección
// vale al menos mientras dure la sesión.
const memory = new Map<string, number>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Otra pestaña cambió la elección.
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function read(tableId: string): number {
  const remembered = memory.get(tableId);
  if (remembered !== undefined) return remembered;
  try {
    return sanitizePageSize(localStorage.getItem(STORAGE_PREFIX + tableId));
  } catch {
    return DEFAULT_PAGE_SIZE;
  }
}

/**
 * Tamaño de página elegido para un listado, recordado en este dispositivo.
 *
 * Cada listado tiene su propia clave (`tableId`), así que elegir 100 en conversaciones no cambia
 * contactos. Lo guardado no es de fiar (se puede editar a mano o venir de otra versión), por eso todo
 * pasa por `sanitizePageSize`: cualquier cosa que no sea una opción válida cae a `DEFAULT_PAGE_SIZE`.
 *
 * Se lee con `useSyncExternalStore` para no pedir dos veces el listado. En una navegación normal el
 * primer render ya trae el valor guardado, así que la consulta sale con el tamaño correcto; durante
 * la hidratación de un refresco de página React usa el default (que es lo que renderizó el servidor)
 * y salta al valor guardado enseguida, sin error de hidratación.
 */
export function usePageSize(tableId: string) {
  const pageSize = useSyncExternalStore(
    subscribe,
    () => read(tableId),
    () => DEFAULT_PAGE_SIZE,
  );

  const setPageSize = useCallback(
    (next: number) => {
      const clean = sanitizePageSize(next);
      memory.set(tableId, clean);
      try {
        localStorage.setItem(STORAGE_PREFIX + tableId, String(clean));
      } catch {
        // Se conserva en `memory`.
      }
      listeners.forEach((listener) => listener());
    },
    [tableId],
  );

  return { pageSize, setPageSize };
}
