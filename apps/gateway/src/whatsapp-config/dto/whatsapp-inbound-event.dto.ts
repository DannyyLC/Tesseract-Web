export type WhatsAppEventType = 'whatsapp.inbound_message.received';

export interface WhatsAppInboundEvent {
  id: string;
  type: WhatsAppEventType | string;
  apiVersion: string;
  createTime: string;
  whatsappInboundMessage: WhatsAppInboundMessage;
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

export default WhatsAppInboundEvent;
