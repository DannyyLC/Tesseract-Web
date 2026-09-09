'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Search, Loader2 } from 'lucide-react';
import { useColumnCount } from '@/hooks/use-column-count';
import { useToolCatalog, flattenToolCatalog } from '@/hooks/automation/use-tool-catalog';
import {
  useInfiniteTenantToolsDashboard,
  flattenTenantTools,
  useWhatsappOutboundStatus,
} from '@/hooks/automation/use-tenant-tools';
import { GetToolsDto } from '@tesseract/types';
import { CatalogIntegrationCard } from './catalog-integration-card';
import { ConnectIntegrationModal } from './connect-integration-modal';
import { WhatsappOutboundLinkModal } from './whatsapp-outbound-link-modal';

const WHATSAPP_OUTBOUND_TOOL_NAME = 'send_bulk_whatsapp';

interface CatalogTabProps {
  onConnect?: (tool: GetToolsDto) => void;
}

export function CatalogTab({ onConnect }: CatalogTabProps) {
  const t = useTranslations('Integrations');
  const [localSearch, setLocalSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [connectTarget, setConnectTarget] = useState<GetToolsDto | null>(null);
  const [whatsappLinkModalOpen, setWhatsappLinkModalOpen] = useState(false);

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
  const { data: whatsappStatus } = useWhatsappOutboundStatus();

  const allCatalogTools = flattenToolCatalog(catalogData);
  const connectedTools = flattenTenantTools(tenantToolsData);

  // ─── Reparto en columnas ──────────────────────────────────────────────
  // Cada columna fluye por su cuenta, así que expandir una carta no abre el hueco que
  // dejaba la rejilla. El reparto es alterno (la carta i va a la columna i % n), no por
  // bloques, y eso compra dos cosas: de izquierda a derecha se sigue leyendo 1, 2, 3 en el
  // orden del catálogo, y al cargar más páginas cada carta nueva se añade al final de su
  // columna sin mover ninguna de las que ya estaban.
  const columnCount = useColumnCount();
  const toolColumns = useMemo(() => {
    const columns: GetToolsDto[][] = Array.from({ length: columnCount }, () => []);
    allCatalogTools.forEach((tool, i) => columns[i % columnCount].push(tool));
    return columns;
  }, [allCatalogTools, columnCount]);

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
    // WhatsApp Outbound is fully driven by the org's WhatsApp channel setup + the link
    // dialog below — it never needs the generic OAuth modal. Routing it there would hit
    // the modal's `provider !== 'none'` branch (provider is 'platform', not 'none') and
    // send the user through a Google OAuth redirect that doesn't apply to this tool.
    if (tool.toolName === WHATSAPP_OUTBOUND_TOOL_NAME) {
      setWhatsappLinkModalOpen(true);
      onConnect?.(tool);
      return;
    }
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
            placeholder={t('searchPlaceholder')}
            className="w-full rounded-full border-none bg-[var(--surface-tint)] py-2.5 pl-10 pr-4 text-sm text-text-primary transition-all placeholder:text-input-placeholder hover:bg-[var(--surface-tint-md)] focus:outline-none focus:ring-2 focus:ring-[var(--border-subtle)]"
          />
        </div>
      </div>

      {/* Results count */}
      {!catalogLoading && (
        <p className="text-xs text-text-tertiary">
          {t('integrationCount', { count: allCatalogTools.length })}
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

      {!catalogLoading && allCatalogTools.length > 0 && (
        <div className="flex items-start gap-4">
          {toolColumns.map((column, columnIndex) => (
            <div key={columnIndex} className="flex min-w-0 flex-1 flex-col">
              {column.map((tool, i) => {
                const isWhatsappOutbound = tool.toolName === WHATSAPP_OUTBOUND_TOOL_NAME;
                return (
                  <CatalogIntegrationCard
                    key={tool.id}
                    tool={tool}
                    // La entrada se escalona por posición dentro de la columna, no por índice
                    // global: con el scroll infinito el índice global crece sin límite y las
                    // cartas de la cuarta página tardaban segundos en aparecer.
                    index={i}
                    connectedCount={connectedCountMap[tool.toolName] ?? 0}
                    onConnect={handleConnectClick}
                    forceDisabled={
                      isWhatsappOutbound && whatsappStatus ? !whatsappStatus.hasWhatsappConfig : false
                    }
                    disabledBadgeText={isWhatsappOutbound ? t('whatsappNoConfigBadge') : undefined}
                    pendingSetupCount={
                      isWhatsappOutbound ? (whatsappStatus?.unlinkedWorkflows.length ?? 0) : 0
                    }
                    onPendingSetupClick={() => setWhatsappLinkModalOpen(true)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!catalogLoading && allCatalogTools.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-secondary">
            <Search size={24} className="text-text-tertiary" />
          </div>
          <p className="font-medium text-text-primary">{t('noResults')}</p>
          <p className="mt-1 text-sm text-text-secondary">{t('noResultsDesc')}</p>
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

      {/* WhatsApp Outbound: link pending workflows to the tenant tool */}
      <WhatsappOutboundLinkModal
        isOpen={whatsappLinkModalOpen}
        onClose={() => setWhatsappLinkModalOpen(false)}
        unlinkedWorkflows={whatsappStatus?.unlinkedWorkflows ?? []}
        linkedWorkflowsNeedingDefault={whatsappStatus?.linkedWorkflowsNeedingDefault ?? []}
      />
    </div>
  );
}
