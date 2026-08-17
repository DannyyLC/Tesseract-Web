export type WhatsAppEventType =
  | 'whatsapp.inbound_message.received'
  | 'whatsapp.smb.message.echoes';

export interface WhatsAppInboundEvent {
  id: string;
  type: WhatsAppEventType | string;
  apiVersion: string;
  createTime: string;
  // Presente en 'whatsapp.inbound_message.received': el cliente le escribe al negocio.
  whatsappInboundMessage: WhatsAppInboundMessage;
  // Presente en 'whatsapp.smb.message.echoes': el negocio le escribe al cliente desde la
  // app de WhatsApp Business, fuera de nuestra API. OJO: aquí `from` es el negocio y `to`
  // es el cliente — al revés que en `whatsappInboundMessage`.
  whatsappMessage?: WhatsAppSmbEchoMessage;
}

export interface WhatsAppInboundMessage {
  id: string;
  wamid?: string;
  wabaId?: string;
  from?: string;
  customerProfile?: CustomerProfile;
  to?: string;
  sendTime?: string;
  type?: string;
  image?: WhatsAppImage;
  text?: WhatsAppText;
  audio?: WhatsAppAudio;
  video?: WhatsAppVideo;
}

export interface WhatsAppSmbEchoMessage {
  id: string;
  wamid?: string;
  status?: string;
  from?: string;
  to?: string;
  toUserId?: string;
  toParentUserId?: string;
  customerProfile?: CustomerProfile;
  wabaId?: string;
  createTime?: string;
  sendTime?: string;
  bizType?: string;
  type?: string;
  image?: WhatsAppImage;
  text?: WhatsAppText;
  audio?: WhatsAppAudio;
  video?: WhatsAppVideo;
  context?: { message_id?: string };
}

export interface CustomerProfile {
  name?: string;
}

export interface WhatsAppImage {
  link?: string;
  caption?: string;
  id?: string;
  sha256?: string;
  mime_type?: string;
}

export interface WhatsAppText {
  body?: string;
}

export interface WhatsAppAudio {
  link?: string;
  id?: string;
  sha256?: string;
  mime_type?: string;
}

export interface WhatsAppVideo {
  link?: string;
  id?: string;
  sha256?: string;
  mime_type?: string;
}

export default WhatsAppInboundEvent;
