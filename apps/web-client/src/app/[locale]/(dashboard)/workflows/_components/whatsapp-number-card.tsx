'use client';

import { motion } from 'framer-motion';
import { Check, MoreVertical, Pencil, Star, Unplug, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import PermissionGuard from '@/components/auth/permission-guard';
import { WhatsappIcon } from '@/components/icons/whatsapp-icon';
import { Link } from '@/i18n/routing';
import { Modal } from '@/components/ui/modal';

interface WhatsappNumberDto {
  id: string;
  phoneNumber: string;
  displayName?: string | null;
  connectionStatus?: 'CONNECTED' | 'DISCONNECTED' | 'ERROR' | 'PENDING';
  createdAt: string;
  isDefaultForOutbound?: boolean;
}

interface WhatsappNumberCardProps {
  number: WhatsappNumberDto;
  index?: number;
  onDelete?: (id: string) => Promise<void>;
  onSetActiveStatus?: (id: string, isActive: boolean) => Promise<void>;
  isActive?: boolean;
  /** Necesario para armar la ruta de edición, que cuelga del workflow. */
  workflowId: string;
  /**
   * Solo se pinta el botón/insignia de "predeterminado" cuando el workflow tiene más de un
   * número — con uno solo no hay nada que elegir, ese es siempre el remitente.
   */
  showDefaultToggle?: boolean;
  onSetDefaultOutbound?: (id: string) => Promise<void>;
}

const STATUS_STYLES: Record<string, { dot: string; label: string; textKey: string }> = {
  CONNECTED: {
    dot: 'bg-success-500',
    label: 'bg-success-500/10 text-[var(--badge-success-text-strong)]',
    textKey: 'statusConfigured',
  },
  ERROR: {
    dot: 'bg-danger',
    label: 'bg-danger/10 text-[var(--badge-danger-text-strong)]',
    textKey: 'statusError',
  },
  DISCONNECTED: {
    dot: 'bg-warning-500',
    label: 'bg-warning-500/10 text-[var(--badge-warning-text-strong)]',
    textKey: 'statusNotConfigured',
  },
  PENDING: {
    dot: 'bg-neutral-400',
    label: 'bg-neutral-500/10 text-[var(--badge-neutral-text-strong)]',
    textKey: 'statusPending',
  },
};

export function WhatsappNumberCard({
  number,
  index = 0,
  onDelete,
  onSetActiveStatus,
  isActive,
  workflowId,
  showDefaultToggle,
  onSetDefaultOutbound,
}: WhatsappNumberCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingDefault, setSettingDefault] = useState(false);
  const [isDisconnectOpen, setIsDisconnectOpen] = useState(false);
  const t = useTranslations('WhatsappNumberCard');
  const locale = useLocale();
  const status =
    STATUS_STYLES[number.connectionStatus ?? 'DISCONNECTED'] ?? STATUS_STYLES.DISCONNECTED;
  const connectionLabel = isActive
    ? 'bg-success-500/10 text-[var(--badge-success-text-strong)]'
    : 'bg-danger/10 text-[var(--badge-danger-text-strong)]';
  const connectionDot = isActive ? 'bg-success-500' : 'bg-danger';
  const connectionText = isActive ? t('connected') : t('disconnected');
  const createdDate = new Date(number.createdAt).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className="group relative flex h-full w-full items-start gap-3 rounded-2xl border border-border bg-surface-elevated p-4 transition-shadow hover:shadow-md"
    >
      {/* Icon */}
      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--surface-tint)] text-text-primary">
        <WhatsappIcon className="h-6 w-6" />
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        {/* Con nombre visible manda el nombre, como en la tarjeta de Messenger, y el
            número baja al subtítulo para no perderlo de vista. */}
        <p className="truncate font-semibold text-text-primary">
          {number.displayName || number.phoneNumber}
        </p>
        <p className="truncate text-xs text-text-tertiary">
          {number.displayName ? number.phoneNumber : t('subtitle')}
        </p>
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

        {/* Fila propia y siempre presente cuando aplica (mismo workflow, mismo estado para
            todas sus tarjetas): así una tarjeta nunca cambia de alto respecto a sus hermanas
            solo porque esta pasó de botón a insignia. */}
        {showDefaultToggle && (
          <div className="mt-2">
            {number.isDefaultForOutbound ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-tint)] px-2.5 py-1 text-xs font-medium text-text-secondary">
                <Star size={11} className="fill-current" />
                {t('defaultOutbound')}
              </span>
            ) : (
              <PermissionGuard permissions="workflows:update">
                <button
                  onClick={async () => {
                    setSettingDefault(true);
                    try {
                      await onSetDefaultOutbound?.(number.id);
                    } finally {
                      setSettingDefault(false);
                    }
                  }}
                  disabled={settingDefault}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-border-hover px-2.5 py-1 text-xs font-medium text-text-tertiary transition-colors hover:border-accent hover:text-text-primary disabled:opacity-50"
                >
                  {settingDefault ? <Check size={11} /> : <Star size={11} />}
                  {t('setDefaultOutbound')}
                </button>
              </PermissionGuard>
            )}
          </div>
        )}
      </div>

      {/* Actions menu */}
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
                  href={`/workflows/${workflowId}/whatsapp/${number.id}/edit`}
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

                    if (isActive) {
                      setIsDisconnectOpen(true);
                      return;
                    }

                    onSetActiveStatus?.(number.id, true);
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
                    onDelete?.(number.id);
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

      <Modal
        isOpen={isDisconnectOpen}
        onClose={() => setIsDisconnectOpen(false)}
        title={t('disconnectModalTitle')}
      >
        <div className="space-y-4">
          <div className="border-danger-500/20 bg-danger/10 rounded-xl border p-4 text-sm text-[var(--danger-text-adaptive)]">
            <p className="mb-2 flex items-center gap-2 font-semibold">
              <Unplug size={16} />
              {t('disconnectConfirmHeading')}
            </p>
            <p className="opacity-90">{t('disconnectConfirmMessage')}</p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setIsDisconnectOpen(false)}
              className="flex-1 rounded-xl bg-[var(--surface-tint)] px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-[var(--surface-tint-md)]"
            >
              {t('cancelButton')}
            </button>
            <button
              onClick={() => {
                setIsDisconnectOpen(false);
                onSetActiveStatus?.(number.id, false);
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-danger px-4 py-2 text-sm font-medium text-brand-white transition-all hover:bg-danger-600"
            >
              {t('confirmDisconnectButton')}
            </button>
          </div>
        </div>
      </Modal>
    </motion.div>
  );
}

export default WhatsappNumberCard;
