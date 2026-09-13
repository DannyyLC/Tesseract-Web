'use client';

import { useEffect, useRef, useState } from 'react';
import { DEFAULT_PAGE_SIZE } from '@tesseract/types';
import { useTranslations } from 'next-intl';
import { Check, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useDatasetMutations } from '@/hooks/automation/use-datasets';
import { useInfiniteDashboardWorkflows } from '@/hooks/automation/use-workflows';
import { Modal } from '@/components/ui/modal';

/** Tamaño de página del listado. Diez caben en la caja sin que haya que estirar el modal. */

/** Pausa al teclear antes de consultar. Una petición por pausa, no una por tecla. */
const SEARCH_DEBOUNCE_MS = 400;

interface RequestWorkflowConnectionModalProps {
  datasetId: string;
  isOpen: boolean;
  onClose: () => void;
  /** Los ya conectados salen del listado: pedir su conexión otra vez no tendría sentido. */
  connectedIds: string[];
}

/**
 * Buscador de workflows, embebido en el cuerpo del modal.
 *
 * No es un desplegable: un panel flotante se recorta contra el borde del modal, y acotarlo a su
 * recuadro lo dejaría de tres renglones. Aquí la lista está siempre a la vista.
 *
 * Va aislado en su propio componente para que el listado solo se pida con el modal abierto:
 * `Modal` no monta a sus hijos mientras está cerrado.
 *
 * El servidor devuelve los más **recientes** que contienen el texto, no los más parecidos: ordena
 * por `createdAt` y el filtro es un `contains`. Para un selector alcanza — con tres o cuatro letras
 * el conjunto ya es corto—, pero no esperes que priorice la mejor coincidencia.
 *
 * La selección es múltiple y a propósito **no** se limpia al cambiar la búsqueda: el punto de
 * poder elegir varios es justo poder buscar "facturación", marcar un par, buscar "ventas" y sumar
 * más sin perder lo ya marcado. Cada fila pinta su propio estado, así que no hay ambigüedad sobre
 * qué se está mandando aunque lo elegido antes ya no esté a la vista.
 */
function WorkflowPicker({
  value,
  onChange,
  connectedIds,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  connectedIds: string[];
}) {
  const t = useTranslations('Datasets');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handler);
  }, [query]);

  // El término entra en la `queryKey`, así que cada búsqueda estrena su propia cadena de cursores
  // y vuelve a empezar por la primera página.
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteDashboardWorkflows(DEFAULT_PAGE_SIZE, debouncedQuery || undefined);

  const connected = new Set(connectedIds);
  const workflows = (data?.pages.flatMap((page) => page.items) ?? []).filter(
    (workflow) => !connected.has(workflow.id),
  );

  const selectedIds = new Set(value);

  const toggle = (workflowId: string) => {
    onChange(
      selectedIds.has(workflowId)
        ? value.filter((id) => id !== workflowId)
        : [...value, workflowId],
    );
  };

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) fetchNextPage();
    });

    observer.observe(sentinel);
    return () => observer.disconnect();
    // `workflows.length` entra a propósito: si una página se va entera en el filtro de conectados,
    // el centinela sigue a la vista y hay que volver a observarlo para pedir la siguiente.
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, workflows.length]);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <label className="block text-sm font-medium text-text-primary">{t('workflowLabel')}</label>
        {value.length > 0 && (
          <span className="text-xs text-text-tertiary">
            {t('workflowsSelectedCount', { count: value.length })}
          </span>
        )}
      </div>

      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
        />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('workflowSearchPlaceholder')}
          className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text-primary outline-none focus:border-border-focus"
        />
      </div>

      <div className="max-h-64 overflow-y-auto rounded-xl border border-border">
        {isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 size={18} className="animate-spin text-text-secondary" />
          </div>
        ) : workflows.length === 0 && !hasNextPage ? (
          <p className="px-3 py-6 text-center text-sm text-text-secondary">
            {debouncedQuery
              ? t('workflowSearchEmpty', { query: debouncedQuery })
              : t('allWorkflowsConnected')}
          </p>
        ) : (
          workflows.map((workflow) => {
            const selected = selectedIds.has(workflow.id);

            return (
              <button
                key={workflow.id}
                type="button"
                onClick={() => toggle(workflow.id)}
                aria-pressed={selected}
                className={`flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left transition-colors last:border-b-0 ${
                  selected ? 'bg-[var(--surface-tint)]' : 'hover:bg-surface-secondary'
                }`}
              >
                <span
                  className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                    selected ? 'border-accent bg-accent' : 'border-border'
                  }`}
                >
                  {selected && <Check size={12} className="text-text-inverse" />}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                  {workflow.name}
                </span>
              </button>
            );
          })
        )}

        {/* Centinela del scroll infinito. Se pinta aunque la lista esté vacía: puede estarlo
            porque el filtro se comió la página, no porque no queden workflows. */}
        {hasNextPage && (
          <div ref={sentinelRef} className="flex justify-center py-2">
            {isFetchingNextPage && (
              <Loader2 size={14} className="animate-spin text-text-tertiary" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function RequestWorkflowConnectionModal({
  datasetId,
  isOpen,
  onClose,
  connectedIds,
}: RequestWorkflowConnectionModalProps) {
  const t = useTranslations('Datasets');
  const { requestWorkflowConnection } = useDatasetMutations();
  const [workflowIds, setWorkflowIds] = useState<string[]>([]);

  const close = () => {
    setWorkflowIds([]);
    onClose();
  };

  const handleRequest = async () => {
    try {
      await requestWorkflowConnection.mutateAsync({ id: datasetId, workflowIds });
      close();
      toast.success(t('requestConnectionSuccess'));
    } catch {
      toast.error(t('requestConnectionError'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title={t('requestConnectionTitle')}>
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">{t('requestConnectionWhy')}</p>
        <p className="text-sm text-text-tertiary">{t('requestConnectionHint')}</p>

        <WorkflowPicker value={workflowIds} onChange={setWorkflowIds} connectedIds={connectedIds} />

        <div className="flex justify-end gap-2">
          <button
            onClick={close}
            className="rounded-xl px-4 py-2 text-sm font-medium text-text-secondary hover:bg-[var(--surface-tint)]"
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleRequest}
            disabled={workflowIds.length === 0 || requestWorkflowConnection.isPending}
            className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-text-inverse disabled:opacity-50"
          >
            {requestWorkflowConnection.isPending && <Loader2 size={16} className="animate-spin" />}
            {requestWorkflowConnection.isPending ? t('requestingConnection') : t('requestConnection')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
