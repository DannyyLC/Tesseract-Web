'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Wrench, Plus, Loader2 } from 'lucide-react';
import {
  useInfiniteTenantToolsDashboard,
  flattenTenantTools,
  useTenantToolMutations,
} from '@/hooks/tools/useTenantTools';
import { DashboardTenantToolDto } from '@/app/_model/tools.dto';
import { toast } from 'sonner';
import { ConnectedToolCard } from './connected-tool-card';
import { RenameToolModal } from './rename-tool-modal';
import { DisconnectCredentialsToolModal } from './disconnect-tool-modal';
import { DeleteToolModal } from './delete-tool';
import { ConnectToolModal } from './connect-tool-modal';


interface MyToolsTabProps {
  onAddTool?: () => void;
  /** Called whenever the total count of connected tools changes — used by the parent for the badge. */
  onCountChange?: (count: number) => void;
}

export function MyToolsTab({ onAddTool, onCountChange }: MyToolsTabProps) {
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useInfiniteTenantToolsDashboard({ pageSize: 12 });

  const tools: DashboardTenantToolDto[] = flattenTenantTools(data);
  const { disconnectTool, deleteTool } = useTenantToolMutations();

  // Rename modal state
  const [renameTarget, setRenameTarget] = useState<{ id: string; displayName: string } | null>(null);
  // Disconnect modal state
  const [disconnectTarget, setDisconnectTarget] = useState<{ id: string; displayName: string } | null>(null);
  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; displayName: string } | null>(null);
  // Connect/Config modal state
  const [configTarget, setConfigTarget] = useState<{ id: string; displayName: string; provider: string } | null>(null);

  // Notify parent of count changes so it can update the tab badge
  // without firing a separate API call
  useEffect(() => {
    onCountChange?.(tools.length);
  }, [tools.length, onCountChange]);

  // ─── Intersection Observer for infinite scroll ────────────────────────
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

  // ─── Handlers ────────────────────────────────────────────────────────
  const handleRename = (id: string) => {
    const tool = tools.find((t) => t.id === id);
    if (tool) setRenameTarget({ id, displayName: tool.displayName });
  };

  const handleDisconnect = (id: string) => {
    const tool = tools.find((t) => t.id === id);
    if (tool) setDisconnectTarget({ id, displayName: tool.displayName });
  };

  const handleDelete = (id: string) => {
    const tool = tools.find((t) => t.id === id);
    if (tool) setDeleteTarget({ id, displayName: tool.displayName });
  };

  const handleConfigCredentials = (id: string) => {
    const tool = tools.find((t) => t.id === id);
    if (tool) {
      setConfigTarget({
        id,
        displayName: tool.displayName,
        provider: tool.toolCatalog.provider,
      });
    }
  };

  const confirmDisconnect = async () => {
    if (!disconnectTarget) return;
    try {
      await disconnectTool.mutateAsync(disconnectTarget.id);
      toast.success('Herramienta desconectada correctamente.');
    } catch {
      toast.error('No se pudo desconectar la herramienta. Intenta de nuevo.');
      throw new Error(); // keep modal open on error
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTool.mutateAsync(deleteTarget.id);
      toast.success('Herramienta eliminada correctamente.');
    } catch {
      toast.error('No se pudo eliminar la herramienta. Intenta de nuevo.');
      throw new Error(); // keep modal open on error
    }
  };

  // ─── Loading skeleton ─────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-2xl bg-black/5 dark:bg-white/5"
          />
        ))}
      </div>
    );
  }

  // ─── Empty state ──────────────────────────────────────────────────────
  if (tools.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-24 text-center"
      >
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-black/5 dark:bg-white/5">
          <Wrench size={28} className="text-black/30 dark:text-white/30" />
        </div>
        <h3 className="mb-1 text-lg font-semibold text-black dark:text-white">
          Sin herramientas conectadas
        </h3>
        <p className="mb-6 text-sm text-black/50 dark:text-white/50">
          Conecta tu primera herramienta desde el catálogo.
        </p>
        <button
          onClick={onAddTool}
          className="flex items-center gap-2 rounded-full bg-black px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-80 dark:bg-white dark:text-black"
        >
          <Plus size={15} />
          Explorar catálogo
        </button>
      </motion.div>
    );
  }

  // ─── List ─────────────────────────────────────────────────────────────
  return (
    <>
      <div className="space-y-3">
        {tools.map((tool, i) => (
          <ConnectedToolCard
            key={tool.id}
            tool={tool}
            index={i}
            onRename={handleRename}
            onDisconnectCredentials={(id) => handleDisconnect(id)}
            onConfigCredentials={handleConfigCredentials}
            onDelete={handleDelete}
          />
        ))}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} />

        {isFetchingNextPage && (
          <div className="flex justify-center py-4">
            <Loader2 size={20} className="animate-spin text-black/30 dark:text-white/30" />
          </div>
        )}
      </div>

      {/* Rename modal */}
      {renameTarget && (
        <RenameToolModal
          isOpen={!!renameTarget}
          onClose={() => setRenameTarget(null)}
          toolId={renameTarget.id}
          currentName={renameTarget.displayName}
        />
      )}

      {/* Disconnect confirmation modal */}
      {disconnectTarget && (
        <DisconnectCredentialsToolModal
          isOpen={!!disconnectTarget}
          onClose={() => setDisconnectTarget(null)}
          toolDisplayName={disconnectTarget.displayName}
          onConfirm={confirmDisconnect}
        />
      )}
      
      {/* Delete confirmation modal */}
      {deleteTarget && (
        <DeleteToolModal
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          toolDisplayName={deleteTarget.displayName}
          onConfirm={confirmDelete}
        />
      )}

      {/* Config/Reconnect modal */}
      {configTarget && (
        <ConnectToolModal
          isOpen={!!configTarget}
          onClose={() => setConfigTarget(null)}
          existingToolId={configTarget.id}
          existingToolDisplayName={configTarget.displayName}
          existingToolProvider={configTarget.provider}
        />
      )}
    </>
  );
}
