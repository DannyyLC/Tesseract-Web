'use client';

import { useTranslations, useFormatter } from 'next-intl';
import { motion } from 'framer-motion';
import { Loader2, MessageCircle, Phone, ShieldBan, ShieldCheck, User } from 'lucide-react';
import { DashboardEndUserDto } from '@tesseract/types';
import PermissionGuard from '@/components/auth/permission-guard';
import { getInitials } from '@/utils/users.utils';
import { ContactOptionsMenu } from './contact-options-menu';

interface ContactCardProps {
  contact: DashboardEndUserDto;
  index: number;
  onBlock: (contact: DashboardEndUserDto) => void;
  onUnblock: (contact: DashboardEndUserDto) => void;
  onEdit: (contact: DashboardEndUserDto) => void;
  onDelete: (contact: DashboardEndUserDto) => void;
  isUnblocking: boolean;
}

/** Prefijo con el que se guarda a un contacto de Messenger en `externalId`. */
const MESSENGER_PREFIX = 'messenger:';

/**
 * Con qué nombre se le conoce a este contacto y por dónde entró.
 *
 * En Messenger el `externalId` es `messenger:<pageId>:<psid>`, que no le dice nada a nadie: se
 * muestra el nombre si Meta lo dio y el PSID suelto si no, nunca la cadena completa.
 */
export function describeContact(contact: DashboardEndUserDto) {
  if (contact.phoneNumber) {
    return {
      label: contact.name || contact.phoneNumber,
      secondary: contact.phoneNumber,
      channel: 'whatsapp' as const,
    };
  }

  if (contact.externalId?.startsWith(MESSENGER_PREFIX)) {
    const psid = contact.externalId.split(':').at(-1) ?? contact.externalId;
    return { label: contact.name || psid, secondary: psid, channel: 'messenger' as const };
  }

  return {
    label: contact.name || contact.email || contact.externalId || contact.id,
    secondary: contact.email ?? contact.externalId ?? null,
    channel: 'other' as const,
  };
}

export function ContactCard({
  contact,
  index,
  onBlock,
  onUnblock,
  onEdit,
  onDelete,
  isUnblocking,
}: ContactCardProps) {
  const t = useTranslations('Contacts');
  const format = useFormatter();
  const isBlocked = contact.blockedAt != null;
  const { label, secondary, channel } = describeContact(contact);
  // Solo con nombre: las iniciales de un teléfono o de un PSID serían "+5" o "71".
  const initials = contact.name?.trim() ? getInitials(contact.name.trim()) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      // Fila transparente que se enmarca al pasar el mouse, como en Usuarios, Workflows y
      // Conversaciones: una caja gris por contacto hacía de la lista un bloque pesado que no
      // se parecía a ninguna otra.
      // En reposo ninguna fila lleva borde, bloqueada o no: el avatar con el escudo y el texto
      // de estado ya la distinguen. Al pasar el mouse, el bloqueado se enmarca en danger. Rojo y
      // no ámbar a propósito — el ámbar ya significa "modo manual" en la conversación, y
      // compartir color obligaría a leer para distinguirlos.
      className={`flex flex-col gap-3 rounded-xl border border-transparent px-4 py-3.5 transition-all duration-200 hover:bg-surface-panel hover:shadow-sm sm:flex-row sm:items-center sm:justify-between ${
        isBlocked ? 'hover:border-danger-600' : 'hover:border-border'
      }`}
    >
      <div className="flex min-w-0 items-center gap-4">
        <div className="relative shrink-0">
          {/* Iniciales en neutro y no con la paleta de avatares de Usuarios: esa incluye rojo,
              que aquí está reservado para "bloqueado". */}
          <div
            className={`flex h-11 w-11 items-center justify-center rounded-full ${
              isBlocked ? 'bg-[var(--badge-danger-bg)]' : 'bg-[var(--surface-tint)]'
            }`}
          >
            {isBlocked ? (
              <ShieldBan size={18} className="text-[var(--badge-danger-text)]" />
            ) : initials ? (
              <span className="text-sm font-semibold text-text-secondary">{initials}</span>
            ) : (
              <User size={18} className="text-text-tertiary" />
            )}
          </div>

          {/* El canal, como insignia del avatar: el mismo lugar que el punto de estado en
              Usuarios, y deja el nombre sin adornos. */}
          {channel !== 'other' && (
            <span
              className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-surface bg-surface-elevated"
              title={channel === 'whatsapp' ? 'WhatsApp' : 'Messenger'}
            >
              {channel === 'whatsapp' ? (
                <Phone size={10} style={{ color: 'var(--brand-whatsapp)' }} />
              ) : (
                <MessageCircle size={10} style={{ color: 'var(--brand-messenger)' }} />
              )}
            </span>
          )}
        </div>

        <div className="min-w-0">
          <p className="truncate font-semibold text-text-primary">{label}</p>

          {secondary && secondary !== label && (
            <p className="truncate text-sm text-text-secondary">{secondary}</p>
          )}

          {/* El texto de estado va además del color: el color solo no es accesible. */}
          {isBlocked && (
            <p className="mt-1 text-xs font-medium text-[var(--badge-danger-text)]">
              {t('blockedSince', {
                date: format.dateTime(new Date(contact.blockedAt as unknown as string), {
                  dateStyle: 'medium',
                }),
              })}
              {' · '}
              {contact.blockedReason || t('noReason')}
              {contact.blockedByName ? ` · ${t('blockedBy', { name: contact.blockedByName })}` : ''}
            </p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 self-start sm:self-auto">
        <PermissionGuard permissions="end_users:block">
          {isBlocked ? (
            <button
              onClick={() => onUnblock(contact)}
              disabled={isUnblocking}
              className="flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-border bg-surface-elevated px-4 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
            >
              {isUnblocking ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <ShieldCheck size={13} />
              )}
              {t('unblockAction')}
            </button>
          ) : (
            <button
              onClick={() => onBlock(contact)}
              className="flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-border px-4 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-danger-600 hover:text-danger disabled:opacity-50"
            >
              <ShieldBan size={13} />
              {t('blockAction')}
            </button>
          )}
        </PermissionGuard>

        <PermissionGuard permissions={['end_users:update', 'end_users:delete']}>
          <ContactOptionsMenu onEdit={() => onEdit(contact)} onDelete={() => onDelete(contact)} />
        </PermissionGuard>
      </div>
    </motion.div>
  );
}
