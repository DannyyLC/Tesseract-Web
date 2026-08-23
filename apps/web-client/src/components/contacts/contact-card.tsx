'use client';

import { useTranslations, useFormatter } from 'next-intl';
import { motion } from 'framer-motion';
import { Loader2, MessageCircle, Phone, ShieldBan, ShieldCheck, User } from 'lucide-react';
import { DashboardEndUserDto } from '@tesseract/types';
import PermissionGuard from '@/components/auth/permission-guard';
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
    return { label: contact.name || contact.phoneNumber, secondary: contact.phoneNumber, channel: 'whatsapp' as const };
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      // El estado se lee sin leer: un bloqueado sale con el borde de la familia danger. Solo
      // el borde y no también el fondo —a diferencia del ícono y el texto de estado, que sí
      // llevan el tinte completo— porque a lo ancho de toda la fila el mismo tinte se siente
      // como demasiado rojo para una lista que se recorre de un vistazo.
      // Rojo y no ámbar a propósito — el ámbar ya significa "modo manual" en la conversación,
      // y compartir color obligaría a leer para distinguirlos.
      className={`flex flex-col gap-3 rounded-2xl border bg-surface-secondary p-4 transition-colors sm:flex-row sm:items-center sm:justify-between ${
        isBlocked ? 'border-danger-600' : 'border-border'
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            isBlocked ? 'bg-[var(--badge-danger-bg)]' : 'bg-surface-elevated'
          }`}
        >
          {isBlocked ? (
            <ShieldBan size={18} className="text-[var(--badge-danger-text)]" />
          ) : (
            <User size={18} className="text-text-tertiary" />
          )}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium text-text-primary">{label}</p>
            {channel === 'whatsapp' && (
              <Phone size={12} className="shrink-0" style={{ color: 'var(--brand-whatsapp)' }} />
            )}
            {channel === 'messenger' && (
              <MessageCircle
                size={12}
                className="shrink-0"
                style={{ color: 'var(--brand-messenger)' }}
              />
            )}
          </div>

          {secondary && secondary !== label && (
            <p className="truncate text-xs text-text-tertiary">{secondary}</p>
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
