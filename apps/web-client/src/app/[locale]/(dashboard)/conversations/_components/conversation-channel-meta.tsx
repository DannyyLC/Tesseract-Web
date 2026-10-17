'use client';

import {
  ArrowRight,
  Bot,
  Calendar,
  Clock,
  Globe,
  Headset,
  MessageSquare,
  Phone,
  Terminal,
  User,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { LastMessageAuthor } from '@tesseract/types';
import { MessengerIcon, WhatsappIcon } from '@/components/icons';

/**
 * El chip del canal y, cuando el canal permite saberlo, quién está del otro lado.
 *
 * Vive en un componente propio porque la lista y el detalle pintaban esto por separado:
 * el bloque del teléfono de WhatsApp estaba duplicado literalmente en los dos, y cada
 * canal nuevo obligaba a acordarse de tocar ambos.
 *
 * Todo se emite con `span`: el detalle lo mete dentro de un `<p>`, donde un `div` es HTML
 * inválido y rompe la hidratación. La fila del último mensaje también es un `span`, con
 * `flex basis-full` para ocupar su propio renglón dentro del contenedor flex de la lista.
 *
 * Esa fila va primero, antes del canal: el último mensaje es lo que se lee de un vistazo
 * para saber por dónde va la conversación, y el canal o el teléfono son el detalle de
 * abajo. Al ocupar el renglón completo, lo que pinte quien nos usa detrás cae en el
 * siguiente, junto al canal, en vez de quedarse solo.
 */

interface ConversationChannelMetaProps {
  channel: string;
  endUserPhoneNumber?: string | null;
  whatsappBusinessPhoneNumber?: string | null;
  endUserName?: string | null;
  messengerPageName?: string | null;
  messengerSenderId?: string | null;
  /**
   * Texto del último mensaje, ya recortado por el gateway. Sin `lastMessageAuthor` no se
   * pinta nada: la fila entera depende de saber quién escribió.
   */
  lastMessagePreview?: string | null;
  /**
   * Autor de ese último mensaje. Ausente o NULL = no se pinta la fila. El detalle no lo
   * pasa a propósito: ahí el hilo completo está a la vista y repetir el último mensaje
   * en el encabezado solo sería ruido.
   */
  lastMessageAuthor?: LastMessageAuthor | null;
  /**
   * Cuándo llegó ese último mensaje, ya formateado por quien nos usa (la lista lo pinta
   * en relativo: "5 min"). Va aquí, y no en una fila aparte, porque la antigüedad solo
   * significa algo pegada al mensaje que fecha: juntos se leen de una pasada.
   */
  lastMessageAtLabel?: string | null;
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

/**
 * Cómo se pinta cada autor del último mensaje.
 *
 * Los colores no son nuevos: el cliente va en neutro porque es el caso esperado, la IA
 * en `info` —el mismo color con el que la página marca lo que viene del sistema— y la
 * persona del equipo en `warning`, que es exactamente el color que ya usan el chip
 * "Intervenido" y el botón de modo manual. Así la fila se lee sin leyenda.
 */
const AUTHOR_STYLES: Record<
  LastMessageAuthor,
  { labelKey: string; chip: string; icon: (size: number) => React.ReactNode }
> = {
  END_USER: {
    labelKey: 'lastMessageAuthorClient',
    chip: 'bg-surface-secondary text-text-secondary',
    icon: (size) => <User size={size} className="shrink-0" />,
  },
  AI: {
    labelKey: 'lastMessageAuthorAi',
    chip: 'bg-info/10 text-info-600',
    icon: (size) => <Bot size={size} className="shrink-0" />,
  },
  HUMAN_AGENT: {
    labelKey: 'lastMessageAuthorYou',
    chip: 'bg-warning-500/10 text-warning-600',
    icon: (size) => <Headset size={size} className="shrink-0" />,
  },
};

export default function ConversationChannelMeta({
  channel,
  endUserPhoneNumber,
  whatsappBusinessPhoneNumber,
  endUserName,
  messengerPageName,
  messengerSenderId,
  lastMessagePreview,
  lastMessageAuthor,
  lastMessageAtLabel,
  size = 'md',
  showChannel = true,
}: ConversationChannelMetaProps) {
  const t = useTranslations('Conversations');

  const iconSize = size === 'sm' ? 11 : 12;
  const textClass = size === 'sm' ? 'text-[11px]' : 'text-xs';
  const routeTextClass = size === 'sm' ? 'text-[11px]' : 'text-xs';

  const style = CHANNEL_STYLES[channel?.toUpperCase()];
  const authorStyle = lastMessageAuthor ? AUTHOR_STYLES[lastMessageAuthor] : null;

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
      {authorStyle && (
        <span
          className="flex w-full min-w-0 basis-full items-center gap-2"
          title={t('lastMessageTitle')}
        >
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${authorStyle.chip}`}
          >
            {authorStyle.icon(iconSize - 1)}
            {t(authorStyle.labelKey)}
          </span>
          {/* Un mensaje de solo adjunto (una imagen sin pie) tiene autor pero no texto:
              se dice que no hay nada que citar en vez de dejar la fila a medias. */}
          <span
            className={`min-w-0 truncate ${textClass} ${
              lastMessagePreview ? 'text-text-secondary' : 'italic text-text-tertiary'
            }`}
          >
            {lastMessagePreview || t('lastMessageNoText')}
          </span>
          {/* `ml-auto` la empuja al extremo del renglón y `shrink-0` hace que sea el
              texto del mensaje —no la fecha— lo que se recorta cuando falta sitio. */}
          {lastMessageAtLabel && (
            <span
              className="ml-auto inline-flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-text-tertiary"
              title={t('lastMessageAtTitle')}
            >
              <Clock size={iconSize - 1} className="shrink-0" />
              {lastMessageAtLabel}
            </span>
          )}
        </span>
      )}

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

      {!authorStyle && lastMessageAtLabel && (
        <span className="inline-flex items-center gap-1.5" title={t('lastMessageAtTitle')}>
          <span className="text-text-tertiary">•</span>
          <Clock size={iconSize} className="shrink-0" />
          <span className={`${textClass} tabular-nums`}>{lastMessageAtLabel}</span>
        </span>
      )}

      {identity.map((item) => (
        <span key={item.key} className="inline-flex items-center gap-1.5" title={item.title}>
          <span className="text-text-tertiary">•</span>
          {item.variant === 'route' ? (
            <span className="inline-flex max-w-full items-start gap-1.5 text-text-secondary">
              <span className="mt-0.5 shrink-0">{item.icon}</span>
              <span
                className={`inline-flex min-w-0 flex-wrap items-center gap-1 ${routeTextClass} whitespace-normal break-words leading-relaxed text-text-primary`}
              >
                <span className="break-all font-medium">
                  {item.value.split(' to ')[0]?.replace(/^From /, '')}
                </span>
                <ArrowRight size={12} className="mt-px shrink-0 text-text-tertiary" />
                <span className="break-all text-text-secondary">
                  {item.value.split(' to ')[1] ?? ''}
                </span>
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
