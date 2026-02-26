'use client';

import { motion } from 'framer-motion';
import { MoreVertical, Unplug, Pencil, KeyRound, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { DashboardTenantToolDto } from '@tesseract/types';
import { DynamicIcon } from '@/components/ui/dynamic-icon';

interface ConnectedToolCardProps {
  tool: DashboardTenantToolDto;
  index: number;
  onRename?: (id: string) => void;
  onDisconnectCredentials?: (id: string) => void;
  onConfigCredentials?: (id: string) => void;
  onDelete?: (id: string) => void;
}

const STATUS_STYLES: Record<string, { dot: string; label: string; text: string }> = {
  active:    { dot: 'bg-emerald-500', label: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400', text: 'Conectado' },
  connected: { dot: 'bg-emerald-500', label: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400', text: 'Conectado' },
  error:     { dot: 'bg-red-500',     label: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400',                 text: 'Error' },
  pending:   { dot: 'bg-amber-500',   label: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400',         text: 'Pendiente' },
};

export function ConnectedToolCard({
  tool,
  index,
  onRename,
  onDisconnectCredentials,
  onConfigCredentials,
  onDelete,
}: ConnectedToolCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const status = STATUS_STYLES[tool.status] ?? STATUS_STYLES.pending;
  const connectedDate = new Date(tool.createdAt).toLocaleDateString('es-MX', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const provider = tool.toolCatalog.provider || 'none';
  const hasCredentials = provider !== 'none';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className="group relative flex items-center gap-4 rounded-2xl border border-black/5 bg-white p-4 transition-shadow hover:shadow-md dark:border-white/5 dark:bg-white/[0.03]"
    >
      {/* Icon */}
      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-black/[0.04] text-black dark:bg-white/[0.06] dark:text-white">
        <DynamicIcon name={tool.toolCatalog.icon} size={24} />
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-black dark:text-white">{tool.displayName}</p>
        <p className="text-xs text-black/40 dark:text-white/40">
          {tool.toolCatalog.displayName} · {tool.toolCatalog.category}
        </p>
        <p className="mt-0.5 text-xs text-black/30 dark:text-white/30">Conectado el {connectedDate}</p>
      </div>

      {/* Status badge */}
      <span className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium sm:flex ${status.label}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
        {status.text}
      </span>

      {/* Actions menu */}
      <div className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-black/30 transition-colors hover:bg-black/5 hover:text-black dark:text-white/30 dark:hover:bg-white/5 dark:hover:text-white"
        >
          <MoreVertical size={16} />
        </button>

        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute right-0 top-full z-20 mt-1 w-60 overflow-hidden rounded-xl border border-black/5 bg-white shadow-xl dark:border-white/5 dark:bg-[#111]">
              {(tool.status === 'pending' || tool.status === 'error') && hasCredentials && (
                <button
                  onClick={() => { setMenuOpen(false); onConfigCredentials?.(tool.id); }}
                  className="flex w-full items-center gap-3 whitespace-nowrap px-4 py-2.5 text-sm text-black/70 transition-colors hover:bg-black/5 hover:text-black dark:text-white/70 dark:hover:bg-white/5 dark:hover:text-white"
                >
                  <KeyRound size={14} />
                  Configurar credenciales
                </button>
              )}
              <button
                onClick={() => { setMenuOpen(false); onRename?.(tool.id); }}
                className="flex w-full items-center gap-3 whitespace-nowrap px-4 py-2.5 text-sm text-black/70 transition-colors hover:bg-black/5 hover:text-black dark:text-white/70 dark:hover:bg-white/5 dark:hover:text-white"
              >
                <Pencil size={14} />
                Renombrar
              </button>
              <div className="mx-3 my-1 h-px bg-black/5 dark:bg-white/5" />
              {tool.isConnected && hasCredentials && (
                <button
                  onClick={() => { setMenuOpen(false); onDisconnectCredentials?.(tool.id); }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
                >
                  <Unplug size={14} />
                  Desconectar credenciales
                </button>
              )}
              <button
                onClick={() => { setMenuOpen(false); onDelete?.(tool.id); }}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
              >
                <Trash2 size={14} />
                Eliminar
              </button>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}
