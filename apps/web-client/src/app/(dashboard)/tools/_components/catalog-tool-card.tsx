'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Zap, ChevronDown, ChevronUp } from 'lucide-react';
import { GetToolsDto } from '@tesseract/types';
import { DynamicIcon } from '@/components/ui/dynamic-icon';
import PermissionGuard from '@/components/auth/permission-guard';

interface CatalogToolCardProps {
  tool: GetToolsDto;
  index: number;
  /**
   * How many instances of this tool the tenant already has connected.
   * 0 = not connected at all.
   * >0 = already has N connections — but the user CAN always connect more.
   */
  connectedCount?: number;
  onConnect?: (tool: GetToolsDto) => void;
}

const CATEGORY_STYLE = 'bg-[var(--surface-tint)] text-text-tertiary';

export function CatalogToolCard({
  tool,
  index,
  connectedCount = 0,
  onConnect,
}: CatalogToolCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05 }}
      layout
      onClick={() => setIsExpanded(!isExpanded)}
      className={`group flex cursor-pointer flex-col rounded-2xl border border-[var(--border-subtle)] bg-surface-elevated p-5 transition-all hover:shadow-md ${!tool.isActive ? 'opacity-50' : ''}`}
    >
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--surface-tint)] text-text-primary">
          <DynamicIcon name={tool.icon} size={24} />
        </div>
        <div className="flex gap-1.5">
          {/* "N connected" badge */}
          {connectedCount > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-[var(--badge-success-bg-solid)] px-2 py-0.5 text-[10px] font-semibold text-[var(--badge-success-text-solid)]">
              <span className="h-1.5 w-1.5 rounded-full bg-success-500" />
              {connectedCount === 1 ? '1 conectada' : `${connectedCount} conectadas`}
            </span>
          )}
          {tool.isInBeta && (
            <span className="flex items-center gap-1 rounded-full bg-[var(--badge-warning-bg-solid)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--warning-text-adaptive)]">
              <Zap size={9} />
              Beta
            </span>
          )}
          {!tool.isActive && (
            <span className="rounded-full bg-[var(--surface-tint)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
              Próximamente
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1">
        <h3 className="font-semibold text-text-primary">{tool.displayName}</h3>
        <p className="mt-1 text-xs leading-relaxed text-text-secondary">
          {tool.description}
        </p>

        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${CATEGORY_STYLE}`}>
              {tool.category}
            </span>
            {tool.functions.length > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-text-tertiary">
                {tool.functions.length} función{tool.functions.length !== 1 ? 'es' : ''}
                {isExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Expanded functions list */}
      <AnimatePresence>
        {isExpanded && tool.functions.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="mt-4 space-y-3 border-t border-[var(--border-subtle)] pt-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
                Funciones disponibles
              </p>
              <div className="space-y-2">
                {tool.functions.map((fn) => (
                  <div
                    key={fn.id}
                    className="group/fn rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-2"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-5 w-5 items-center justify-center rounded bg-[var(--surface-tint)] text-text-tertiary">
                        <DynamicIcon name={fn.icon} size={12} />
                      </div>
                      <p className="text-xs font-semibold text-text-primary">
                        {fn.displayName}
                      </p>
                    </div>
                    <p className="mt-1 text-[10px] leading-relaxed text-text-secondary">
                      {fn.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <div className="mt-4 border-t border-[var(--border-subtle)] pt-4">
        <PermissionGuard permissions="tenant_tools:create">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (tool.isActive) onConnect?.(tool);
            }}
            disabled={!tool.isActive}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2 text-sm font-medium text-text-inverse transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Plus size={14} />
            {connectedCount > 0 ? 'Conectar otra instancia' : 'Conectar'}
          </button>
        </PermissionGuard>
      </div>
    </motion.div>
  );
}
