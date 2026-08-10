'use client';

import { ArrowRight, Calendar, Globe, MessageSquare, Phone, Terminal, User, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { MessengerIcon, WhatsappIcon } from '@/components/icons';

/**
 * El chip del canal y, cuando el canal permite saberlo, quién está del otro lado.
 *
 * Vive en un componente propio porque la lista y el detalle pintaban esto por separado:
 * el bloque del teléfono de WhatsApp estaba duplicado literalmente en los dos, y cada
 * canal nuevo obligaba a acordarse de tocar ambos.
 *
 * Todo se emite con `span`: el detalle lo mete dentro de un `<p>`, donde un `div` es HTML
 * inválido y rompe la hidratación.
 */

interface ConversationChannelMetaProps {
  channel: string;
  endUserPhoneNumber?: string | null;
  whatsappBusinessPhoneNumber?: string | null;
  endUserName?: string | null;
  messengerPageName?: string | null;
  messengerSenderId?: string | null;
  /** El detalle usa iconos un punto más pequeños que la lista. */
  size?: 'sm' | 'md';
  /** El detalle solo quiere la identidad: el canal ya se deduce del propio chat. */
  showChannel?: boolean;
}

/**
 * Cómo se pinta cada canal. Antes el color era un ternario —WhatsApp verde, TODO lo demás
 * azul— y el nombre salía crudo del enum en minúsculas, sin traducir.
 *
 * Las claves son los valores de `ConversationChannel`. Un canal que no esté aquí cae en
 * `FALLBACK`, así que añadir uno al schema degrada a un chip genérico en vez de romper.
 */
const CHANNEL_STYLES: Record<
  string,
  { labelKey: string; chip: string; icon: (size: number) => React.ReactNode }
> = {
  WHATSAPP: {
    labelKey: 'channelWhatsapp',
    chip: 'bg-success-500/10 text-success-600',
    icon: (size) => <WhatsappIcon width={size} height={size} />,
  },
  MESSENGER: {
    labelKey: 'channelMessenger',
    chip: 'bg-[var(--brand-messenger)]/10 text-[var(--brand-messenger)]',
    icon: (size) => <MessengerIcon width={size} height={size} />,
  },
  DASHBOARD: {
    labelKey: 'channelDashboard',
    chip: 'bg-info/10 text-info-600',
    icon: (size) => <MessageSquare size={size} />,
  },
  WEB: {
    labelKey: 'channelWeb',
    chip: 'bg-info/10 text-info-600',
    icon: (size) => <Globe size={size} />,
  },
  API: {
    labelKey: 'channelApi',
    chip: 'bg-neutral-500/10 text-text-secondary',
    icon: (size) => <Terminal size={size} />,
  },
  CRON: {
    labelKey: 'channelCron',
    chip: 'bg-neutral-500/10 text-text-secondary',
    icon: (size) => <Calendar size={size} />,
  },
};

const FALLBACK = {
  chip: 'bg-neutral-500/10 text-text-secondary',
  icon: (size: number) => <MessageSquare size={size} />,
};

export default function ConversationChannelMeta({
  channel,
  endUserPhoneNumber,
  whatsappBusinessPhoneNumber,
  endUserName,
  messengerPageName,
  messengerSenderId,
  size = 'md',
  showChannel = true,
}: ConversationChannelMetaProps) {
  const t = useTranslations('Conversations');

  const iconSize = size === 'sm' ? 11 : 12;
  const textClass = size === 'sm' ? 'text-[11px]' : 'text-xs';
  const routeTextClass = size === 'sm' ? 'text-[11px]' : 'text-xs';

  const style = CHANNEL_STYLES[channel?.toUpperCase()];

  /** Los datos que identifican a quien escribe, según lo que sepamos de cada canal. */
  const identity: {
    key: string;
    title: string;
    icon: React.ReactNode;
    value: string;
    variant?: 'default' | 'route';
  }[] = [];

  if (channel === 'WHATSAPP') {
    if (endUserPhoneNumber && whatsappBusinessPhoneNumber) {
      identity.push({
        key: 'route',
        title: t('phoneNumberTitle'),
        icon: <Phone size={iconSize} className="shrink-0" />,
        value: `From ${endUserPhoneNumber} to ${whatsappBusinessPhoneNumber}`,
        variant: 'route',
      });
    } else if (endUserPhoneNumber) {
      identity.push({
        key: 'phone',
        title: t('phoneNumberTitle'),
        icon: <Phone size={iconSize} className="shrink-0" />,
        value: endUserPhoneNumber,
      });
    } else if (whatsappBusinessPhoneNumber) {
      identity.push({
        key: 'business-phone',
        title: t('phoneNumberTitle'),
        icon: <Phone size={iconSize} className="shrink-0" />,
        value: whatsappBusinessPhoneNumber,
      });
    }
  }

  if (channel === 'MESSENGER') {
    const senderLabel = endUserName || messengerSenderId;
    if (senderLabel && messengerPageName) {
      identity.push({
        key: 'route',
        title: t('messengerPageTitle'),
        icon: <Users size={iconSize} className="shrink-0" />,
        value: `From ${senderLabel} to ${messengerPageName}`,
        variant: 'route',
      });
    } else if (senderLabel) {
      identity.push({
        key: 'name',
        title: t('customerNameTitle'),
        icon: <User size={iconSize} className="shrink-0" />,
        value: senderLabel,
      });
    } else if (messengerPageName) {
      identity.push({
        key: 'page',
        title: t('messengerPageTitle'),
        icon: <Users size={iconSize} className="shrink-0" />,
        value: messengerPageName,
      });
    }
  }

  return (
    <>
      {showChannel && (
        <span className="inline-flex items-center gap-1.5">
          <span
            className={`inline-flex items-center justify-center rounded-full p-1 ${
              style?.chip ?? FALLBACK.chip
            }`}
          >
            {(style?.icon ?? FALLBACK.icon)(iconSize)}
          </span>
          {/* Sin entrada en el mapa se muestra el valor crudo: para diagnosticar un canal
              nuevo es más útil que un "Desconocido" que esconde cuál es. */}
          <span className={`${textClass} font-medium`}>{style ? t(style.labelKey) : channel}</span>
        </span>
      )}

      {identity.map((item) => (
        <span key={item.key} className="inline-flex items-center gap-1.5" title={item.title}>
          <span className="text-text-tertiary">•</span>
          {item.variant === 'route' ? (
            <span className="inline-flex max-w-full items-start gap-1.5 text-text-secondary">
              <span className="mt-0.5 shrink-0">{item.icon}</span>
              <span className={`inline-flex min-w-0 flex-wrap items-center gap-1 ${routeTextClass} whitespace-normal break-words leading-relaxed text-text-primary`}>
                <span className="break-all font-medium">{item.value.split(' to ')[0]?.replace(/^From /, '')}</span>
                <ArrowRight size={12} className="mt-px shrink-0 text-text-tertiary" />
                <span className="break-all text-text-secondary">{item.value.split(' to ')[1] ?? ''}</span>
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              {item.icon}
              <span className={`${textClass} max-w-[200px] truncate`}>{item.value}</span>
            </span>
          )}
        </span>
      ))}
    </>
  );
}
