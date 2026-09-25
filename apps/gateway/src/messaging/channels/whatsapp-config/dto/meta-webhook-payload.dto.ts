/**
 * Payload del webhook de WhatsApp de la Cloud API de Meta. Solo se tipa lo que se lee.
 *
 * https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components
 */
export interface MetaWebhookPayload {
  object: 'whatsapp_business_account' | string;
  entry?: MetaWebhookEntry[];
}

export interface MetaWebhookEntry {
  /** WABA id. */
  id: string;
  changes?: MetaWebhookChange[];
}

export interface MetaWebhookChange {
  /** `messages` para lo entrante (y acuses en `statuses`); `smb_message_echoes` en coexistencia. */
  field: 'messages' | 'smb_message_echoes' | string;
  value: MetaWebhookValue;
}

export interface MetaWebhookValue {
  messaging_product?: 'whatsapp';
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: { wa_id?: string; profile?: { name?: string } }[];
  messages?: MetaMessage[];
  message_echoes?: MetaMessage[];
}

export interface MetaMedia {
  id?: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
}

export interface MetaMessage {
  id: string;
  from?: string;
  /** Solo en echoes: el cliente al que escribió el negocio. */
  to?: string;
  /** Unix en segundos, como string. */
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: MetaMedia;
  audio?: MetaMedia;
  video?: MetaMedia;
  context?: { id?: string };
}
