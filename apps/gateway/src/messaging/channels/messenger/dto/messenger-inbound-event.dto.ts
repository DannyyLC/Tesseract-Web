/**
 * Forma del webhook de Messenger (Meta Platform).
 *
 * A diferencia de YCloud, que manda un evento por request, Meta agrupa: un POST trae
 * `entry[]` (una entrada por página) y cada entrada trae `messaging[]` (un elemento
 * por evento). El controlador aplana esa estructura en {@link MessengerInboundEvent},
 * que es la unidad que se guarda en el buffer y con la que trabaja el worker.
 *
 * https://developers.facebook.com/docs/messenger-platform/webhooks
 */

export interface MessengerWebhookPayload {
  /** Siempre 'page' para Messenger. Instagram y WhatsApp usan otro valor. */
  object: string;
  entry?: MessengerWebhookEntry[];
}

export interface MessengerWebhookEntry {
  /** Id de la página que recibió el mensaje. Es la llave de la config. */
  id: string;
  time?: number;
  messaging?: MessengerMessagingEvent[];
}

export interface MessengerMessagingEvent {
  sender?: MessengerParticipant;
  recipient?: MessengerParticipant;
  timestamp?: number;
  message?: MessengerMessage;
  postback?: MessengerPostback;
  /** Acuses de entrega/lectura. No son mensajes; se descartan. */
  delivery?: unknown;
  read?: unknown;
}

export interface MessengerParticipant {
  /** PSID del usuario, o id de la página según el lado. */
  id?: string;
}

export interface MessengerMessage {
  /** Id del mensaje. Único y estable: es la llave de deduplicación. */
  mid?: string;
  text?: string;
  /** `true` cuando el mensaje lo envió la propia página (evento `message_echoes`). */
  is_echo?: boolean;
  quick_reply?: { payload?: string };
  attachments?: MessengerAttachment[];
}

export type MessengerAttachmentType =
  | 'image'
  | 'audio'
  | 'video'
  | 'file'
  | 'location'
  | 'fallback'
  | string;

export interface MessengerAttachment {
  type?: MessengerAttachmentType;
  payload?: MessengerAttachmentPayload;
}

export interface MessengerAttachmentPayload {
  /** URL firmada del CDN de Meta. Caduca, así que hay que descargarla en el turno. */
  url?: string;
  /** Presente en stickers. */
  sticker_id?: number;
  title?: string;
}

export interface MessengerPostback {
  mid?: string;
  title?: string;
  payload?: string;
}

/**
 * Un único evento de mensajería ya resuelto contra su página.
 *
 * Es el análogo de `WhatsAppInboundEvent`: lo que se persiste en el buffer y lo que
 * recibe `workflows.execute()` como contexto del canal.
 */
export interface MessengerInboundEvent {
  /** Id de la página. En un echo la deduce de `sender`, no de `recipient`. */
  pageId: string;
  /** PSID de la persona (nunca de la página, ni siquiera en un echo). */
  senderId: string;
  /** `message.mid` o `postback.mid`. */
  messageId: string;
  /** Epoch ms según Meta. */
  timestamp?: number;
  messaging: MessengerMessagingEvent;
  /** `true` cuando el mensaje lo mandó la página (event `message_echoes`). */
  isEcho: boolean;
}

export default MessengerInboundEvent;
