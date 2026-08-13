'use client';

import PermissionGuard from '@/components/auth/permission-guard';
import { Link } from '@/i18n/routing';
import { motion } from 'framer-motion';
import { MoreVertical, Pencil, Unplug, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { FaFacebookMessenger } from 'react-icons/fa6';
import { useState } from 'react';

interface MessengerPageDto {
  id: string;
  pageId: string;
  pageName: string | null;
  connectionStatus?: 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
  createdAt: string;
}

interface MessengerPageCardProps {
  page: MessengerPageDto;
  index?: number;
  onDelete?: (id: string) => Promise<void>;
  onSetActiveStatus?: (id: string, isActive: boolean) => Promise<void>;
  isActive?: boolean;
  /** Necesario para armar la ruta de edición, que cuelga del workflow. */
  workflowId: string;
}

// El mapa vive fuera del componente, donde no hay hooks: guarda la clave de traducción
// y el texto se resuelve ya dentro, con `t`.
const STATUS_STYLES: Record<string, { dot: string; label: string; textKey: string }> = {
  CONNECTED: {
    dot: 'bg-success-500',
    label: 'border border-success-500/25 bg-success-500/10 text-[var(--badge-success-text-strong)]',
    textKey: 'statusConfigured',
  },
  ERROR: {
    dot: 'bg-danger',
    label: 'border border-danger-500/25 bg-danger/10 text-[var(--badge-danger-text-strong)]',
    textKey: 'statusError',
  },
  DISCONNECTED: {
    dot: 'bg-warning-500',
    label: 'border border-warning-500/25 bg-warning-500/10 text-[var(--badge-warning-text-strong)]',
    textKey: 'statusNotConfigured',
  },
};

export function MessengerPageCard({
  page,
  index = 0,
  onDelete,
  onSetActiveStatus,
  isActive,
  workflowId,
}: MessengerPageCardProps) {
  const t = useTranslations('MessengerPageCard');
  const locale = useLocale();
  const [menuOpen, setMenuOpen] = useState(false);
  const status =
    STATUS_STYLES[page.connectionStatus ?? 'DISCONNECTED'] ?? STATUS_STYLES.DISCONNECTED;
  const connectionLabel = isActive
    ? 'border border-success-500/25 bg-success-500/10 text-[var(--badge-success-text-strong)]'
    : 'border border-danger-500/25 bg-danger/10 text-[var(--badge-danger-text-strong)]';
  const connectionDot = isActive ? 'bg-success-500' : 'bg-danger';
  const connectionText = isActive ? t('connected') : t('disconnected');
  // La fecha sigue al idioma elegido, no a un 'es-MX' fijo.
  const createdDate = new Date(page.createdAt).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className="group relative flex w-full items-start gap-3 rounded-2xl border border-border bg-surface-elevated p-4 transition-shadow hover:shadow-md"
    >
      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--surface-tint)] text-[#0084FF]">
        <FaFacebookMessenger className="h-6 w-6 text-[#0084FF]" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-text-primary">{page.pageName || page.pageId}</p>
        <p className="text-xs text-text-tertiary">{t('subtitle')}</p>
        <p className="mt-0.5 text-xs text-text-tertiary">{t('addedOn', { date: createdDate })}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${status.label}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
            {t(status.textKey)}
          </span>

          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${connectionLabel}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${connectionDot}`} />
            {connectionText}
          </span>
        </div>
      </div>

      <div className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={t('menuAriaLabel')}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-[var(--surface-tint)] hover:text-text-secondary"
        >
          <MoreVertical size={16} />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-full z-20 mt-1 w-60 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-surface-popover shadow-xl">
              <PermissionGuard permissions="workflows:update">
                <Link
                  href={`/workflows/${workflowId}/messenger/${page.id}/edit`}
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-3 whitespace-nowrap px-4 py-2.5 text-sm text-text-secondary transition-colors hover:bg-[var(--surface-tint)] hover:text-text-primary"
                >
                  <Pencil size={14} />
                  {t('edit')}
                </Link>
              </PermissionGuard>

              <div className="mx-3 my-1 h-px bg-surface-secondary" />

              <PermissionGuard permissions="workflows:update">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    const targetState = !isActive;

                    if (onSetActiveStatus) {
                      onSetActiveStatus(page.id, targetState);
                    }
                  }}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                    !isActive
                      ? 'text-[var(--success-text-adaptive)] hover:bg-[var(--success-tint-hover)]'
                      : 'text-[var(--danger-text-adaptive)] hover:bg-[var(--danger-tint-hover)]'
                  }`}
                >
                  <Unplug size={14} />
                  {!isActive ? t('connect') : t('disconnect')}
                </button>
              </PermissionGuard>

              <PermissionGuard permissions="workflows:delete">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete?.(page.id);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[var(--danger-text-adaptive)] transition-colors hover:bg-[var(--danger-tint-hover)]"
                >
                  <Trash2 size={14} />
                  {t('delete')}
                </button>
              </PermissionGuard>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

export default MessengerPageCard;
