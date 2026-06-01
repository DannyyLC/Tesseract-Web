'use client';

import { motion } from 'framer-motion';
import { MoreVertical, Unplug, Pencil, KeyRound, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DashboardTenantToolDto } from '@tesseract/types';
import { DynamicIcon } from '@/components/ui/dynamic-icon';
import PermissionGuard from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/identity/use-auth';

interface ConnectedIntegrationCardProps {
  tool: DashboardTenantToolDto;
  index: number;
  onRename?: (id: string) => void;
  onDisconnectCredentials?: (id: string) => void;
  onConfigCredentials?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function ConnectedIntegrationCard({
  tool,
  index,
  onRename,
  onDisconnectCredentials,
  onConfigCredentials,
  onDelete,
}: ConnectedIntegrationCardProps) {
  const t = useTranslations('Integrations');
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: currentUser } = useAuth();

  const STATUS_STYLES: Record<string, { dot: string; label: string; text: string }> = {
    CONNECTED: {
      dot: 'bg-success-500',
      label: 'bg-[var(--badge-success-bg-solid)] text-[var(--badge-success-text-solid)]',
      text: t('connectedStatus'),
    },
    ERROR: {
      dot: 'bg-danger',
      label: 'bg-[var(--badge-danger-bg-solid)] text-[var(--badge-danger-text-solid)]',
      text: t('errorStatus'),
    },
    DISCONNECTED: {
      dot: 'bg-warning-500',
      label: 'bg-[var(--badge-warning-bg-solid)] text-[var(--badge-warning-text-solid)]',
      text: t('disconnectedStatus'),
    },
    EXPIRED_AUTH: {
      dot: 'bg-[var(--chart-timeout)]',
      label: 'bg-[var(--badge-orange-bg-solid)] text-[var(--badge-orange-text-solid)]',
      text: t('expiredAuth'),
    },
  };
  const isOwnerRole = currentUser?.role === 'owner';
  const isToolOwner = !!currentUser && tool.createdByUserId === currentUser.sub;
  const canManageTool = isOwnerRole || isToolOwner;
  const status = STATUS_STYLES[tool.status] ?? STATUS_STYLES.DISCONNECTED;
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
      className="group relative flex items-center gap-4 rounded-2xl border border-[var(--border-subtle)] bg-surface-elevated p-4 transition-shadow hover:shadow-md"
    >
      {/* Icon */}
      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--surface-tint)] text-text-primary">
        <DynamicIcon name={tool.toolCatalog.icon} size={24} />
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-text-primary">{tool.displayName}</p>
        <p className="text-xs text-text-tertiary">
          {tool.toolCatalog.displayName} · {tool.toolCatalog.category}
        </p>
        <p className="mt-0.5 text-xs text-text-tertiary">
          {t('connectedOn', { date: connectedDate })}
        </p>
      </div>

      {/* Status badge */}
      <span
        className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium sm:flex ${status.label}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
        {status.text}
      </span>

      {/* Actions menu */}
      {canManageTool && (
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-[var(--surface-tint)] hover:text-text-primary"
          >
            <MoreVertical size={16} />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full z-20 mt-1 w-60 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-surface-popover shadow-xl">
                {(tool.status === 'DISCONNECTED' ||
                  tool.status === 'ERROR' ||
                  tool.status === 'EXPIRED_AUTH') &&
                  hasCredentials && (
                    <PermissionGuard permissions="tenant_tools:update">
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          onConfigCredentials?.(tool.id);
                        }}
                        className="flex w-full items-center gap-3 whitespace-nowrap px-4 py-2.5 text-sm text-text-secondary transition-colors hover:bg-[var(--surface-tint)] hover:text-text-primary"
                      >
                        <KeyRound size={14} />
                        {t('configureCredentials')}
                      </button>
                    </PermissionGuard>
                  )}
                <PermissionGuard permissions="tenant_tools:update">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onRename?.(tool.id);
                    }}
                    className="flex w-full items-center gap-3 whitespace-nowrap px-4 py-2.5 text-sm text-text-secondary transition-colors hover:bg-[var(--surface-tint)] hover:text-text-primary"
                  >
                    <Pencil size={14} />
                    {t('rename')}
                  </button>
                </PermissionGuard>
                <div className="mx-3 my-1 h-px bg-surface-secondary" />
                {tool.isConnected && hasCredentials && (
                  <PermissionGuard permissions="tenant_tools:disconnect">
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onDisconnectCredentials?.(tool.id);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[var(--danger-text-adaptive)] transition-colors hover:bg-[var(--danger-tint-hover)]"
                    >
                      <Unplug size={14} />
                      {t('disconnectCredentials')}
                    </button>
                  </PermissionGuard>
                )}
                <PermissionGuard permissions="tenant_tools:delete">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete?.(tool.id);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[var(--danger-text-adaptive)] transition-colors hover:bg-[var(--danger-tint-hover)]"
                  >
                    <Trash2 size={14} />
                    {t('deleteMenuItem')}
                  </button>
                </PermissionGuard>
              </div>
            </>
          )}
        </div>
      )}
    </motion.div>
  );
}
