'use client';

import { motion } from 'framer-motion';
import { MoreVertical, Unplug, Trash2 } from 'lucide-react';
import { useState } from 'react';
import PermissionGuard from '@/components/auth/permission-guard';
import { WhatsappIcon } from '@/components/icons/whatsapp-icon';

interface WhatsappNumberDto {
  id: string;
  phoneNumber: string;
  connectionStatus?: 'CONNECTED' | 'DISCONNECTED' | 'ERROR' | 'PENDING';
  createdAt: string;
}

interface WhatsappNumberCardProps {
  number: WhatsappNumberDto;
  index?: number;
  onDelete?: (id: string) => Promise<void>;
  onSetActiveStatus?: (id: string, isActive: boolean) => Promise<void>;
  isActive?: boolean;
}

const STATUS_STYLES: Record<string, { dot: string; label: string; text: string }> = {
  CONNECTED: {
    dot: 'bg-success-500',
    label: 'border border-success-500/25 bg-success-500/10 text-[var(--badge-success-text-strong)]',
    text: 'Configurado',
  },
  ERROR: {
    dot: 'bg-danger',
    label: 'border border-danger-500/25 bg-danger/10 text-[var(--badge-danger-text-strong)]',
    text: 'Error',
  },
  DISCONNECTED: {
    dot: 'bg-warning-500',
    label: 'border border-warning-500/25 bg-warning-500/10 text-[var(--badge-warning-text-strong)]',
    text: 'No Configurado',
  },
  PENDING: {
    dot: 'bg-neutral-400',
    label: 'border border-neutral-500/20 bg-neutral-500/10 text-[var(--badge-neutral-text-strong)]',
    text: 'Pendiente',
  },
};

export function WhatsappNumberCard({
  number,
  index = 0,
  onDelete,
  onSetActiveStatus,
  isActive,
}: WhatsappNumberCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const status =
    STATUS_STYLES[number.connectionStatus ?? 'DISCONNECTED'] ?? STATUS_STYLES.DISCONNECTED;
  const connectionLabel = isActive
    ? 'border border-success-500/25 bg-success-500/10 text-[var(--badge-success-text-strong)]'
    : 'border border-danger-500/25 bg-danger/10 text-[var(--badge-danger-text-strong)]';
  const connectionDot = isActive ? 'bg-success-500' : 'bg-danger';
  const connectionText = isActive ? 'Conectado' : 'Desconectado';
  const createdDate = new Date(number.createdAt).toLocaleDateString('es-MX', {
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
      {/* Icon */}
      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--surface-tint)] text-text-primary">
        <WhatsappIcon className="h-6 w-6" />
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-text-primary">{number.phoneNumber}</p>
        <p className="text-xs text-text-tertiary">Número de Whatsapp</p>
        <p className="mt-0.5 text-xs text-text-tertiary">Agregado el {createdDate}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${status.label}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
            {status.text}
          </span>

          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${connectionLabel}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${connectionDot}`} />
            {connectionText}
          </span>
        </div>
      </div>

      {/* Actions menu */}
      <div className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-[var(--surface-tint)] hover:text-text-secondary"
        >
          <MoreVertical size={16} />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-full z-20 mt-1 w-60 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-surface-popover shadow-xl">
              {/* <PermissionGuard permissions="workflows:update">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onEdit?.(number.id);
                  }}
                  className="flex w-full items-center gap-3 whitespace-nowrap px-4 py-2.5 text-sm text-text-secondary transition-colors hover:bg-[var(--surface-tint)] hover:text-text-primary"
                >
                  <Pencil size={14} />
                  Editar número
                </button>
              </PermissionGuard> */}

              <div className="mx-3 my-1 h-px bg-surface-secondary" />

              <PermissionGuard permissions="workflows:update">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    console.log(
                      `Toggling active status for WhatsApp number with id: ${number.id}. Current status: ${isActive}`,
                    );
                    const targetState = !isActive;

                    if (onSetActiveStatus) {
                      onSetActiveStatus(number.id, targetState);
                    }
                  }}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                    !isActive
                      ? 'text-[var(--success-text-adaptive)] hover:bg-[var(--success-tint-hover)]'
                      : 'text-[var(--danger-text-adaptive)] hover:bg-[var(--danger-tint-hover)]'
                  }`}
                >
                  <Unplug size={14} />
                  {!isActive ? 'Conectar' : 'Desconectar'}
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
                  Eliminar
                </button>
              </PermissionGuard>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

export default WhatsappNumberCard;
