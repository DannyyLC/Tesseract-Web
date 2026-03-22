"use client";

import { motion } from 'framer-motion';
import { MoreVertical, Unplug, Trash2 } from 'lucide-react';
import { useState } from 'react';
import PermissionGuard from '@/components/auth/PermissionGuard';
import { WhatsappIcon } from '@/app/_shared/_components/icons/whatsapp-icon';

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
    dot: 'bg-emerald-500',
    label: 'border border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    text: 'Configurado',
  },
  ERROR: {
    dot: 'bg-red-500',
    label: 'border border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300',
    text: 'Error',
  },
  DISCONNECTED: {
    dot: 'bg-amber-500',
    label: 'border border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    text: 'No Configurado',
  },
  PENDING: {
    dot: 'bg-zinc-400',
    label: 'border border-zinc-500/20 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
    text: 'Pendiente',
  },
};

export function WhatsappNumberCard({ number, index = 0, onDelete, onSetActiveStatus, isActive }: WhatsappNumberCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const status = STATUS_STYLES[number.connectionStatus ?? 'DISCONNECTED'] ?? STATUS_STYLES.DISCONNECTED;
  const connectionLabel = isActive
    ? 'border border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    : 'border border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300';
  const connectionDot = isActive ? 'bg-emerald-500' : 'bg-red-500';
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
      className="group relative flex w-full items-start gap-3 rounded-2xl border border-black/10 bg-white p-4 transition-shadow hover:shadow-md dark:border-white/10 dark:bg-[#141414]"
    >
      {/* Icon */}
      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-black/[0.04] text-black dark:bg-white/[0.06] dark:text-white">
        <WhatsappIcon className="w-6 h-6" />
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-black dark:text-white">{number.phoneNumber}</p>
        <p className="text-xs text-black/40 dark:text-white/40">Número de Whatsapp</p>
        <p className="mt-0.5 text-xs text-black/30 dark:text-white/30">Agregado el {createdDate}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${status.label}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
            {status.text}
          </span>

          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${connectionLabel}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${connectionDot}`} />
            {connectionText}
          </span>
        </div>
      </div>

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
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-full z-20 mt-1 w-60 overflow-hidden rounded-xl border border-black/5 bg-white shadow-xl dark:border-white/5 dark:bg-[#111]">
              
              {/* <PermissionGuard permissions="workflows:update">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onEdit?.(number.id);
                  }}
                  className="flex w-full items-center gap-3 whitespace-nowrap px-4 py-2.5 text-sm text-black/70 transition-colors hover:bg-black/5 hover:text-black dark:text-white/70 dark:hover:bg-white/5 dark:hover:text-white"
                >
                  <Pencil size={14} />
                  Editar número
                </button>
              </PermissionGuard> */}

              <div className="mx-3 my-1 h-px bg-black/5 dark:bg-white/5" />

              <PermissionGuard permissions="workflows:update">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    console.log(`Toggling active status for WhatsApp number with id: ${number.id}. Current status: ${isActive}`);
                    const targetState = !isActive;

                    if (onSetActiveStatus) {
                      onSetActiveStatus(number.id, targetState);
                    }
                  }}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                    !isActive
                      ? 'text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/50'
                      : 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50'
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
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
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
