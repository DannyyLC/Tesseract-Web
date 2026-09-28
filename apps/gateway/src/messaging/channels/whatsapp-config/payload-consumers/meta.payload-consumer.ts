import * as crypto from 'crypto';
import {
  MetaMessage,
  MetaWebhookChange,
  MetaWebhookPayload,
  MetaWebhookValue,
} from '../dto';
import { MetaTransporter } from '../transporters/meta.transporter';
import { normalizePhone } from '@/platform/common/utils/normalize-phone';
import { BaseWBPayloadConsumer } from './base-wb-payload-consumer';
import {
  EBMessageType,
  WBEventTypes,
  WBMediaSource
} from './wb-payload-consumer.interface';

/** Lada de México, tal como la usa Meta al anteponer su `1` de móvil heredado. */
const META_MX_COUNTRY_CODE = '52';
/** Longitud de un número mexicano completo sin el `1` de móvil: 52 + 10 dígitos. */
const META_MX_NATIONAL_LENGTH = 12;

/** Un webhook de la Cloud API de Meta. */
export class MetaPayloadConsumer extends BaseWBPayloadConsumer<MetaWebhookPayload> {
  /**
   * Verifica el `x-hub-signature-256` de un webhook de la Cloud API de Meta: `sha256=` más
   * el HMAC del body crudo con el app secret (`META_WHATSAPP_APP_SECRET`). Tiene que ser el
   * body crudo: `JSON.stringify(body)` no reproduce los bytes que Meta firmó.
   */

  async verifySignature(rawBody: string, headers: object): Promise<boolean> {
    const appSecret = (this.associatedAccount.sessionData as { appSecret?: unknown } | null)?.appSecret;
     if (typeof appSecret !== 'string' || !appSecret) {
      throw new Error(
        `WhatsAppConfig (meta) no tiene sessionData.accessToken`,
      );
    }

    if (!appSecret) {
      this.logger.error('META_WHATSAPP_APP_SECRET no está configurado');
      return false;
    }

    const [algorithm, signature] = this.headerValue(headers, 'x-hub-signature-256').split('=');
    if (algorithm !== 'sha256' || !signature) return false;

    const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
    return this.safeEqual(signature, expected);
  }

  /**
   * Igual que en el evento de YCloud: en un echo `from` es el negocio, no el cliente.
   *
   * `sanitizeMetaPhoneNumber` deja el número en la misma forma que usa YCloud, para que los
   * dos proveedores generen la misma clave (cuenta, buffer, conversación) para el mismo
   * remitente real.
   */
  getFromNumber(): string {
    return this.sanitizeMetaPhoneNumber(this.message?.from);
  }

  /**
   * En un mensaje entrante Meta no trae `to`: el destinatario es el número del negocio, que
   * viene en `metadata.display_phone_number` (a veces con espacios o guiones).
   */
  getToNumber(): string {
    const message = this.message;
    if (message?.to) return this.sanitizeMetaPhoneNumber(message.to);
    return this.sanitizeMetaPhoneNumber(this.value?.metadata?.display_phone_number);
  }

  /**
   * Meta manda los números en dígitos crudos, sin `+`, y para México con el `1` de móvil
   * heredado (`5214493973847`) que YCloud ya no manda (`+524493973847`). Es una limpieza
   * deliberada y local a Meta —no un supuesto general sobre `+52`—: el `1` es un marcador que
   * la propia Cloud API de Meta agrega para México, así que quitarlo aquí es deshacer lo que
   * puso el proveedor, no adivinar el país del número.
   */
  private sanitizeMetaPhoneNumber(phone?: string): string {
    const canonical = normalizePhone(phone) ?? '';
    if (!canonical) return canonical;

    const digits = canonical.slice(1);
    if (digits.startsWith(`${META_MX_COUNTRY_CODE}1`) && digits.length === META_MX_NATIONAL_LENGTH + 1) {
      return `+${META_MX_COUNTRY_CODE}${digits.slice(META_MX_COUNTRY_CODE.length + 1)}`;
    }
    return canonical;
  }

  /** ISO 8601, como el `sendTime` de YCloud. Meta manda unix en segundos; sin él, la hora actual. */
  getSendTime(): string {
    const seconds = Number(this.message?.timestamp);
    return Number.isFinite(seconds) && seconds > 0
      ? new Date(seconds * 1000).toISOString()
      : new Date().toISOString();
  }

  getWhatsappMessageId(): string {
    return this.message?.id ?? '';
  }

  /**
   * Solo cuentan los eventos que traen un mensaje: `messages` con `messages` (entrante) y
   * `smb_message_echoes` con `message_echoes`. Todo lo demás es `NotAllowed`: los acuses
   * (`statuses`, que también llegan con `field: 'messages'`), otros campos y otros objetos.
   */
  getWBEventType(): WBEventTypes {
    if (this.payload?.object !== 'whatsapp_business_account') return WBEventTypes.NotAllowed;

    const { field } = this.change ?? {};
    if (field === 'messages' && this.value?.messages?.length) return WBEventTypes.MsgReceived;
    if (field === 'smb_message_echoes' && this.value?.message_echoes?.length) {
      return WBEventTypes.MsgEchoes;
    }
    return WBEventTypes.NotAllowed;
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

  /**
   * Meta no manda un `link`, solo el `id` del medio: hay que pedir la URL a la Graph API con
   * el token de la cuenta, y esa URL también se descarga con el token (no es pública).
   */
  async audioSource(): Promise<WBMediaSource | undefined> {
    const audio = this.message?.audio;
    if (!audio?.id) return undefined;
    return this.resolveMediaSource(audio.id, audio.mime_type ?? 'audio/ogg', audio.sha256);
  }

  /** Igual que el audio: Meta solo manda el `id` de la imagen, hay que resolverlo contra la Graph API. */
  async imageSource(): Promise<WBMediaSource | undefined> {
    const image = this.message?.image;
    if (!image?.id) return undefined;
    return this.resolveMediaSource(image.id, image.mime_type ?? 'image/jpeg', image.sha256);
  }

  /** Resuelve el `id` de un medio de Meta a una URL descargable, con el token de la cuenta. */
  private async resolveMediaSource(
    mediaId: string,
    fallbackMimeType: string,
    fallbackSha256: string | undefined,
  ): Promise<WBMediaSource> {
    const accessToken = (this.associatedAccount.sessionData as { accessToken?: unknown } | null)?.accessToken;
    if (typeof accessToken !== 'string' || !accessToken) {
      throw new Error('La cuenta de Meta no tiene sessionData.accessToken para bajar multimedia');
    }
    const headers = { Authorization: `Bearer ${accessToken}` };

    const response = await fetch(`${MetaTransporter.api_base_url}/${mediaId}`, { headers });
    if (!response.ok) {
      throw new Error(`Meta no resolvió el medio ${mediaId}: ${response.status}`);
    }
    const media = (await response.json()) as { url?: string; mime_type?: string; sha256?: string };
    if (!media.url) throw new Error(`Meta no devolvió URL para el medio ${mediaId}`);

    return {
      url: media.url,
      mimeType: media.mime_type ?? fallbackMimeType,
      sha256: fallbackSha256 ?? media.sha256,
      headers,
    };
  }

  private get change(): MetaWebhookChange | undefined {
    return this.payload?.entry?.[0]?.changes?.[0];
  }

  private get value(): MetaWebhookValue | undefined {
    return this.change?.value;
  }

  /** Los entrantes vienen en `messages`; los echoes de coexistencia, en `message_echoes`. */
  private get message(): MetaMessage | undefined {
    return this.value?.messages?.[0] ?? this.value?.message_echoes?.[0];
  }
}
