import {
  ProcessedAttachment
} from '@/automation/media-processing/media-processing.service';

export enum WBEventTypes {
  MsgReceived,
  MsgEchoes,
  NotAllowed
}

export enum EBMessageType {
  Text = 'text',
  Audio = 'audio',
  Video = 'video',
  Image = 'image',
}


/**
 * Resultado de interpretar un mensaje. Un mensaje aporta a lo sumo un texto, un adjunto
 * procesado y un aviso; quien agrega la ventana junta los de todos y quita avisos repetidos.
 */
export interface WBInterpretedMessage {
  /** Texto utilizable: el cuerpo, el pie de una imagen o la transcripción de un audio. */
  text?: string;
  attachment?: ProcessedAttachment;
  /** Aviso para el usuario cuando el mensaje no se pudo (o no se quiso) procesar. */
  notice?: string;
  /** Detalle técnico de un fallo de multimedia, para el log. */
  mediaError?: string;
}

/** De dónde bajar un audio: cada proveedor lo expone distinto. */
export interface WBMediaSource {
  url: string;
  mimeType: string;
  sha256?: string;
  /** Headers de la descarga, si la URL no es pública. */
  headers?: Record<string, string>;
}

/**
 * Lectura de UN webhook entrante de WhatsApp, independiente del proveedor. Cada proveedor
 * manda un payload con su propia forma; el consumer es quien la conoce, para que el resto del
 * pipeline no dependa de ella. Recibe el payload al construirse, así que hay una instancia por
 * webhook (no es un singleton). El envío saliente vive en los transporters.
 */
export interface IWBPayloadConsumer {
  /** `rawBody` es el body crudo; un `JSON.stringify` del body parseado no reproduce lo firmado. */
  verifySignature(rawBody: string, headers: object): Promise<boolean>;
  getFromNumber(): string;
  getToNumber(): string;
  getSendTime(): string;
  getWhatsappMessageId(): string;
  getWBEventType(): WBEventTypes;
  getMessageType(): EBMessageType;
  /**
   * Convierte el mensaje del payload en texto utilizable: transcribe audios, lee pies de
   * imagen y avisa lo que no se soporta o la política del workflow apagó.
   */
  getInterpretedMessage(): Promise<WBInterpretedMessage>;
  /** Dónde bajar el audio del mensaje; cada proveedor lo expone distinto. */
  audioSource(): Promise<WBMediaSource | undefined>;
  /** Dónde bajar la imagen del mensaje; cada proveedor lo expone distinto. */
  imageSource(): Promise<WBMediaSource | undefined>;
}
