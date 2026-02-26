import { useEffect, useRef, useCallback } from 'react';

interface DraftStorage {
  [key: string]: {
    draft: string;
    timestamp: number;
  };
}

const STORAGE_KEY = 'tesseract_drafts';
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 horas
const DEBOUNCE_MS = 800;

/**
 * Hook para persistir borradores de mensajes en localStorage
 *
 * @param conversationId - ID de la conversación actual (puede ser 'new')
 * @param workflowId - ID del workflow (usado para conversaciones nuevas)
 * @returns Funciones para cargar, guardar y limpiar borradores
 */
export function useDraftPersistence(conversationId: string, workflowId?: string) {
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasRunGarbageCollection = useRef(false);

  // Generar la clave de almacenamiento
  const getStorageKey = useCallback(() => {
    if (conversationId === 'new' && workflowId) {
      return `new_${workflowId}`;
    }
    return conversationId;
  }, [conversationId, workflowId]);

  // Leer todos los borradores del localStorage
  const getAllDrafts = useCallback((): DraftStorage => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      console.error('Error reading drafts from localStorage:', error);
      return {};
    }
  }, []);

  // Guardar todos los borradores al localStorage
  const saveAllDrafts = useCallback((drafts: DraftStorage) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
    } catch (error) {
      console.error('Error saving drafts to localStorage:', error);
    }
  }, []);

  // Garbage collection: eliminar borradores antiguos (>24 horas)
  const runGarbageCollection = useCallback(() => {
    const now = Date.now();
    const drafts = getAllDrafts();
    let hasChanges = false;

    Object.keys(drafts).forEach((key) => {
      const draft = drafts[key];
      if (now - draft.timestamp > MAX_AGE_MS) {
        delete drafts[key];
        hasChanges = true;
      }
    });

    if (hasChanges) {
      saveAllDrafts(drafts);
    }
  }, [getAllDrafts, saveAllDrafts]);

  // Ejecutar garbage collection solo una vez al montar
  useEffect(() => {
    if (!hasRunGarbageCollection.current) {
      runGarbageCollection();
      hasRunGarbageCollection.current = true;
    }
  }, [runGarbageCollection]);

  // Cargar borrador para la conversación actual
  const loadDraft = useCallback((): string => {
    const key = getStorageKey();
    const drafts = getAllDrafts();
    return drafts[key]?.draft || '';
  }, [getStorageKey, getAllDrafts]);

  // Guardar borrador (con debouncing automático)
  const saveDraft = useCallback(
    (text: string) => {
      // Limpiar timer anterior
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Si el texto está vacío, limpiar el borrador inmediatamente
      if (!text.trim()) {
        const key = getStorageKey();
        const drafts = getAllDrafts();
        delete drafts[key];
        saveAllDrafts(drafts);
        return;
      }

      // Guardar con debouncing
      debounceTimerRef.current = setTimeout(() => {
        const key = getStorageKey();
        const drafts = getAllDrafts();

        drafts[key] = {
          draft: text,
          timestamp: Date.now(),
        };

        saveAllDrafts(drafts);
      }, DEBOUNCE_MS);
    },
    [getStorageKey, getAllDrafts, saveAllDrafts]
  );

  // Limpiar borrador de la conversación actual
  const clearDraft = useCallback(() => {
    const key = getStorageKey();
    const drafts = getAllDrafts();
    delete drafts[key];
    saveAllDrafts(drafts);
  }, [getStorageKey, getAllDrafts, saveAllDrafts]);

  // Migrar borrador de conversación nueva a conversación real
  const migrateDraft = useCallback(
    (newConversationId: string) => {
      if (conversationId === 'new' && workflowId) {
        const oldKey = `new_${workflowId}`;
        const drafts = getAllDrafts();

        if (drafts[oldKey]) {
          // Copiar a la nueva clave
          drafts[newConversationId] = drafts[oldKey];
          // Eliminar la clave antigua
          delete drafts[oldKey];
          saveAllDrafts(drafts);
        }
      }
    },
    [conversationId, workflowId, getAllDrafts, saveAllDrafts]
  );

  // Limpiar timer al desmontar
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    loadDraft,
    saveDraft,
    clearDraft,
    migrateDraft,
  };
}
