'use client';

import { useState, useRef, useCallback } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { useToolCatalog, flattenToolCatalog } from '@/hooks/tools/useToolCatalog';
import { useInfiniteTenantToolsDashboard, flattenTenantTools } from '@/hooks/tools/useTenantTools';
import { GetToolsDto } from '@tesseract/types';
import { CatalogToolCard } from './catalog-tool-card';
import { ConnectToolModal } from './connect-tool-modal';

interface CatalogTabProps {
  onConnect?: (tool: GetToolsDto) => void;
}

export function CatalogTab({ onConnect }: CatalogTabProps) {
  const [search, setSearch] = useState('');
  const [connectTarget, setConnectTarget] = useState<GetToolsDto | null>(null);

  // ─── Real data ────────────────────────────────────────────────────────
  const {
    data: catalogData,
    isLoading: catalogLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useToolCatalog({ pageSize: 20, search: search || undefined });

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
            className="absolute left-4 top-1/2 -translate-y-1/2 text-black/30 dark:text-white/30"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar herramientas..."
            className="hover:bg-black/8 w-full rounded-full border-none bg-black/5 py-2.5 pl-10 pr-4 text-sm text-black transition-all placeholder:text-black/30 focus:outline-none focus:ring-2 focus:ring-black/10 dark:bg-white/5 dark:text-white dark:placeholder:text-white/30 dark:focus:ring-white/10"
          />
        </div>
      </div>

      {/* Results count */}
      {!catalogLoading && (
        <p className="text-xs text-black/40 dark:text-white/40">
          {allCatalogTools.length} herramienta{allCatalogTools.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* Loading skeleton */}
      {catalogLoading && (
        <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-52 animate-pulse rounded-2xl bg-black/5 dark:bg-white/5" />
          ))}
        </div>
      )}

      {/* Grid */}
      {!catalogLoading && allCatalogTools.length > 0 && (
        <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {allCatalogTools.map((tool, i) => (
            <CatalogToolCard
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
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-black/5 dark:bg-white/5">
            <Search size={24} className="text-black/30 dark:text-white/30" />
          </div>
          <p className="font-medium text-black dark:text-white">Sin resultados</p>
          <p className="mt-1 text-sm text-black/50 dark:text-white/50">
            Intenta con otra búsqueda.
          </p>
        </div>
      )}

      {/* Infinite scroll sentinel + spinner */}
      <div ref={sentinelRef} />
      {isFetchingNextPage && (
        <div className="flex justify-center py-4">
          <Loader2 size={20} className="animate-spin text-black/30 dark:text-white/30" />
        </div>
      )}

      {/* Connect Modal */}
      {connectTarget && (
        <ConnectToolModal
          isOpen={!!connectTarget}
          onClose={() => setConnectTarget(null)}
          catalogTool={connectTarget}
        />
      )}
    </div>
  );
}
