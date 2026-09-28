import * as crypto from 'crypto';
import {
  WhatsAppInboundEvent,
  WhatsAppInboundMessage,
  WhatsAppSmbEchoMessage,
} from '../dto';
import { BaseWBPayloadConsumer } from './base-wb-payload-consumer';
import {
  EBMessageType,
  WBEventTypes,
  WBMediaSource,
} from './wb-payload-consumer.interface';

/** Ventana máxima entre el timestamp de la firma y ahora; cierra el replay de firmas capturadas. */
const WEBHOOK_SIGNATURE_TOLERANCE_SECONDS = 300;

/** Un webhook de YCloud. */
export class YCloudPayloadConsumer extends BaseWBPayloadConsumer<WhatsAppInboundEvent> {
  /**
   * Verifica el header `ycloud-signature`, con formato `t=<unix>,v1=<hmac_hex>`: el HMAC
   * SHA-256 de `<timestamp>.<payload>` con `Y_CLOUD_WEBHOOK_SECRET`. Acepta `s` como alias
   * de `v1`. `rawBody` debe ser el body crudo, no un `JSON.stringify` del body parseado.
   */
  async verifySignature(rawBody: string, headers: object): Promise<boolean> {
    const secret = process.env.Y_CLOUD_WEBHOOK_SECRET ?? '';
    const signatureHeader = this.headerValue(headers, 'ycloud-signature');
    if (!secret || !signatureHeader) return false;

    let timestamp: string | undefined;
    let signature: string | undefined;
    for (const part of signatureHeader.split(',')) {
      const separator = part.indexOf('=');
      if (separator === -1) continue;
      const key = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      if (key === 't') timestamp = value;
      else if (key === 'v1' || key === 's') signature = value;
    }
    if (!timestamp || !signature) return false;

    // La unidad del timestamp se detecta sola: en segundos ronda 1.7e9, en milisegundos 1.7e12.
    const rawTimestamp = Number(timestamp);
    if (!Number.isFinite(rawTimestamp)) return false;
    const timestampSeconds = rawTimestamp > 1e12 ? rawTimestamp / 1000 : rawTimestamp;
    const ageSeconds = Math.abs(Date.now() / 1000 - timestampSeconds);
    if (ageSeconds > WEBHOOK_SIGNATURE_TOLERANCE_SECONDS) {
      this.logger.warn(
        `Firma de YCloud fuera de la ventana de tolerancia (${Math.round(ageSeconds)}s)`,
      );
      return false;
    }

    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');
    return this.safeEqual(signature, expected);
  }

  /** En un echo `from` es el negocio y `to` el cliente: al revés que en un mensaje entrante. */
  getFromNumber(): string {
    return this.message?.from ?? '';
  }

  getToNumber(): string {
    return this.message?.to ?? '';
  }

  /** ISO 8601; sin `sendTime`, la hora actual. */
  getSendTime(): string {
    return this.message?.sendTime || new Date().toISOString();
  }

  /** El id de WhatsApp (`wamid`); `id` es el de YCloud y queda de respaldo. */
  getWhatsappMessageId(): string {
    const message = this.message;
    return message?.wamid || message?.id || '';
  }

  /** Cualquier `type` que no sea entrante o echo (estados, plantillas, ...) es `NotAllowed`. */
  getWBEventType(): WBEventTypes {
    switch (this.payload?.type) {
      case 'whatsapp.inbound_message.received':
        return WBEventTypes.MsgReceived;
      case 'whatsapp.smb.message.echoes':
        return WBEventTypes.MsgEchoes;
      default:
        return WBEventTypes.NotAllowed;
    }
  }

  /** Los tipos que el enum no cubre (sticker, document, ...) caen en `Text`. */
  getMessageType(): EBMessageType {
    switch (this.message?.type) {
      case 'image':
        return EBMessageType.Image;
      case 'audio':
        return EBMessageType.Audio;
      case 'video':
        return EBMessageType.Video;
      default:
        return EBMessageType.Text;
    }
  }

  protected rawMessageType(): string | undefined {
    return this.message?.type;
  }

  protected textBody(): string | undefined {
    return this.message?.text?.body;
  }

  protected imageCaption(): string | undefined {
    return this.message?.image?.caption;
  }

  /** YCloud ya entrega el `link` del audio, descargable sin credenciales. */
   async audioSource(): Promise<WBMediaSource | undefined> {
    const audio = this.message?.audio;
    if (!audio) return undefined;
    return {
      url: audio.link || '',
      mimeType: audio.mime_type || 'audio/ogg',
      sha256: audio.sha256,
    };
  }

  /** Igual que el audio: YCloud ya entrega el `link` de la imagen, descargable sin credenciales. */
  async imageSource(): Promise<WBMediaSource | undefined> {
    const image = this.message?.image;
    if (!image) return undefined;
    return {
      url: image.link || '',
      mimeType: image.mime_type || 'image/jpeg',
      sha256: image.sha256,
    };
  }

  /** Cada tipo de evento trae el mensaje bajo una llave distinta. */
  private get message(): WhatsAppInboundMessage | WhatsAppSmbEchoMessage | undefined {
    return this.getWBEventType() === WBEventTypes.MsgEchoes
      ? this.payload?.whatsappMessage
      : this.payload?.whatsappInboundMessage;
  }
}
