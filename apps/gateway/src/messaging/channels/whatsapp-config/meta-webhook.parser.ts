import {
  MetaMedia,
  MetaMessage,
  MetaWebhookPayload,
  WhatsAppInboundEvent,
} from './dto';

/**
 * Traduce el webhook de la Cloud API de Meta al formato de evento de YCloud.
 *
 * Todo lo que corre después del webhook (buffer, worker, workflows) lee la forma de YCloud,
 * así que convertir aquí, en el borde, deja el resto del pipeline sin cambios.
 *
 * Meta agrupa varios mensajes —y hasta varios números— en un solo POST, así que un payload
 * produce N eventos. Los acuses (`statuses`) y cualquier otro `field` no producen ninguno.
 *
 * OJO con la multimedia: Meta no manda `link`, solo el `id` del medio, que hay que resolver
 * contra la Graph API con el token de la cuenta. Aquí se conserva el `id` y `link` queda vacío.
 */
export function parseMetaWebhook(payload: MetaWebhookPayload): WhatsAppInboundEvent[] {
  if (payload?.object !== 'whatsapp_business_account') return [];

  const events: WhatsAppInboundEvent[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const { value } = change;
      const businessNumber = toE164(value?.metadata?.display_phone_number);

      if (change.field === 'messages') {
        for (const message of value.messages ?? []) {
          const profileName = value.contacts?.find((c) => c.wa_id === message.from)?.profile
            ?.name;
          events.push({
            id: message.id,
            type: 'whatsapp.inbound_message.received',
            apiVersion: 'meta',
            createTime: toIso(message.timestamp),
            whatsappInboundMessage: {
              ...toMessageBody(message),
              wabaId: entry.id,
              from: toE164(message.from),
              to: businessNumber,
              customerProfile: profileName ? { name: profileName } : undefined,
            },
          });
        }
      } else if (change.field === 'smb_message_echoes') {
        // En el echo `from` es el negocio y `to` el cliente, igual que en YCloud. Como en
        // YCloud, el echo no trae `whatsappInboundMessage` aunque el tipo lo declare.
        for (const message of value.message_echoes ?? []) {
          events.push({
            id: message.id,
            type: 'whatsapp.smb.message.echoes',
            apiVersion: 'meta',
            createTime: toIso(message.timestamp),
            whatsappMessage: {
              ...toMessageBody(message),
              wabaId: entry.id,
              from: toE164(message.from) ?? businessNumber,
              to: toE164(message.to),
              context: message.context?.id ? { message_id: message.context.id } : undefined,
            },
          } as WhatsAppInboundEvent);
        }
      }
    }
  }

  return events;
}

/** Campos comunes a entrantes y echoes. Meta usa el `wamid` como `id` del mensaje. */
function toMessageBody(message: MetaMessage) {
  return {
    id: message.id,
    wamid: message.id,
    sendTime: toIso(message.timestamp),
    type: message.type,
    text: message.text,
    image: toMedia(message.image),
    audio: toMedia(message.audio),
    video: toMedia(message.video),
  };
}

function toMedia(media?: MetaMedia) {
  if (!media) return undefined;
  return { id: media.id, mime_type: media.mime_type, sha256: media.sha256, caption: media.caption };
}

/**
 * Meta manda los números sin `+` (y `display_phone_number` puede venir con espacios o
 * guiones). YCloud los manda en E.164, que es lo que esperan las búsquedas de config,
 * la lista negra y las conversaciones.
 */
function toE164(phone?: string): string | undefined {
  const digits = phone?.replace(/\D/g, '');
  return digits ? `+${digits}` : undefined;
}

function toIso(unixSeconds?: string): string {
  const seconds = Number(unixSeconds);
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000).toISOString()
    : new Date().toISOString();
}
