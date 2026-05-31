'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { useToolCatalog, flattenToolCatalog } from '@/hooks/automation/use-tool-catalog';
import { useInfiniteTenantToolsDashboard, flattenTenantTools } from '@/hooks/automation/use-tenant-tools';
import { GetToolsDto } from '@tesseract/types';
import { CatalogIntegrationCard } from './catalog-integration-card';
import { ConnectIntegrationModal } from './connect-integration-modal';

interface CatalogTabProps {
  onConnect?: (tool: GetToolsDto) => void;
}

export function CatalogTab({ onConnect }: CatalogTabProps) {
  const [localSearch, setLocalSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [connectTarget, setConnectTarget] = useState<GetToolsDto | null>(null);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(localSearch);
    }, 500);
    return () => clearTimeout(handler);
  }, [localSearch]);

  // ─── Real data ────────────────────────────────────────────────────────
  const {
    data: catalogData,
    isLoading: catalogLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useToolCatalog({ pageSize: 20, search: debouncedSearch || undefined });

  const { data: tenantToolsData } = useInfiniteTenantToolsDashboard({ pageSize: 100 });

  const allCatalogTools = flattenToolCatalog(catalogData);
  const connectedTools = flattenTenantTools(tenantToolsData);

  // Build a map: toolName → count of connected instances
  const connectedCountMap = connectedTools.reduce<Record<string, number>>((acc, t) => {
    const key = t.toolCatalog.toolName;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  // ─── Infinite scroll sentinel ─────────────────────────────────────────
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (observerRef.current) observerRef.current.disconnect();
      if (!node) return;
      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      });
      observerRef.current.observe(node);
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  );

  const handleConnectClick = (tool: GetToolsDto) => {
    setConnectTarget(tool);
    onConnect?.(tool);
  };

  return (
    <div className="space-y-5">
      {/* Search filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            size={15}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            type="text"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Buscar integraciones..."
            className="w-full rounded-full border-none bg-[var(--surface-tint)] py-2.5 pl-10 pr-4 text-sm text-text-primary transition-all placeholder:text-input-placeholder focus:outline-none focus:ring-2 focus:ring-[var(--border-subtle)] hover:bg-[var(--surface-tint-md)]"
          />
        </div>
      </div>

      {/* Results count */}
      {!catalogLoading && (
        <p className="text-xs text-text-tertiary">
          {allCatalogTools.length} integración{allCatalogTools.length !== 1 ? 'es' : ''}
        </p>
      )}

      {/* Loading skeleton */}
      {catalogLoading && (
        <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-52 animate-pulse rounded-2xl bg-surface-secondary" />
          ))}
        </div>
      )}

      {/* Grid */}
      {!catalogLoading && allCatalogTools.length > 0 && (
        <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {allCatalogTools.map((tool, i) => (
            <CatalogIntegrationCard
              key={tool.id}
              tool={tool}
              index={i}
              connectedCount={connectedCountMap[tool.toolName] ?? 0}
              onConnect={handleConnectClick}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!catalogLoading && allCatalogTools.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-secondary">
            <Search size={24} className="text-text-tertiary" />
          </div>
          <p className="font-medium text-text-primary">Sin resultados</p>
          <p className="mt-1 text-sm text-text-secondary">
            Intenta con otra búsqueda.
          </p>
        </div>
      )}

      {/* Infinite scroll sentinel + spinner */}
      <div ref={sentinelRef} />
      {isFetchingNextPage && (
        <div className="flex justify-center py-4">
          <Loader2 size={20} className="animate-spin text-text-tertiary" />
        </div>
      )}

      {/* Connect Modal */}
      {connectTarget && (
        <ConnectIntegrationModal
          isOpen={!!connectTarget}
          onClose={() => setConnectTarget(null)}
          catalogTool={connectTarget}
        />
      )}
    </div>
  );
}
