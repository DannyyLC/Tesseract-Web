import { approximateAudioSeconds, maxAudioBytes } from '@/automation/media-processing/media-policy';
import { MediaProcessingService } from '@/automation/media-processing/media-processing.service';
import * as crypto from 'crypto';
import { Logger } from 'winston';
import {
  EBMessageType,
  IWBPayloadConsumer,
  WBEventTypes,
  WBInterpretedMessage,
  WBMediaSource,
} from './wb-payload-consumer.interface';
import { WhatsAppConfig } from '@prisma/client';
import { maskPhone } from '@/platform/common/utils/mask-phone';
import { WorkflowsService } from '@/automation/workflows/workflows.service';
import { WhatsappConfigService } from '../whatsapp-config.service';

export abstract class BaseWBPayloadConsumer<TPayload> implements IWBPayloadConsumer {

  protected associatedAccount: WhatsAppConfig;
  constructor(
    protected readonly payload: TPayload,
    protected readonly logger: Logger,
    protected readonly mediaProcessingService: MediaProcessingService,
    protected readonly workflowsService: WorkflowsService,
    protected readonly whatsappConfigService: WhatsappConfigService,
  ) {}

  async initAsyncProcesses() {
    var targetNumber = this.getWBEventType() == WBEventTypes.MsgEchoes ? this.getFromNumber() : this.getToNumber();
    var account = await this.whatsappConfigService.getWhatsappConfigByPhoneNumber(targetNumber);

    if (account) this.associatedAccount = account;
  }

  abstract verifySignature(rawBody: string, headers: object): Promise<boolean>;
  abstract getFromNumber(): string;
  abstract getToNumber(): string;
  abstract getSendTime(): string;
  abstract getWhatsappMessageId(): string;
  abstract getWBEventType(): WBEventTypes;
  abstract getMessageType(): EBMessageType;

  /** `type` del mensaje tal como lo manda el proveedor (`text`, `sticker`, ...), sin agrupar. */
  protected abstract rawMessageType(): string | undefined;
  protected abstract textBody(): string | undefined;
  protected abstract imageCaption(): string | undefined;
  /** Dónde bajar el audio; puede consultar al proveedor. `undefined` si el mensaje no lo trae. */
  abstract audioSource(): Promise<WBMediaSource | undefined>;
  /** Dónde bajar la imagen; puede consultar al proveedor. `undefined` si el mensaje no lo trae. */
  abstract imageSource(): Promise<WBMediaSource | undefined>;

  /**
   * Interpretación de un mensaje. La lógica de política (qué tipos se procesan, qué aviso
   * se da) es la misma para todos los proveedores y vive aquí; cada uno solo aporta dónde
   * están el texto, el pie de imagen y el audio dentro de su payload.
   */
  async getInterpretedMessage(): Promise<WBInterpretedMessage> {
    // Acuses y otros eventos sin mensaje: no hay nada que interpretar ni que avisar.
    if (this.getWBEventType() === WBEventTypes.NotAllowed) return {};
    const organizationId = this.associatedAccount.organizationId;
    const logContext = { 
      organizationId: organizationId, 
      phoneNumber: this.associatedAccount.phoneNumber, 
      userNumber: maskPhone(this.getToNumber()) 
    };
    const defaultWorkflowId = this.associatedAccount.defaultWorkflowId;
    const policy = await this.workflowsService.getMediaPolicy(organizationId, defaultWorkflowId || '');

    const messageId = this.getWhatsappMessageId();

    switch (this.rawMessageType()) {
      case 'text':
        return { text: this.textBody() };

      case 'image':
        if (!policy.image.enabled) return { notice: policy.messages.imageDisabled };
        return { text: this.imageCaption() };

      case 'video':
        this.logger.warn('Mensaje de video recibido, no soportado', { ...logContext, messageId });
        return { notice: policy.messages.videoDisabled };

      case 'audio':
        return this.interpretAudio(messageId);

      default:
        // Stickers, documentos, ubicaciones, contactos. Antes solo se registraba y el
        // usuario no recibía nada.
        this.logger.warn('Tipo de mensaje de WhatsApp no manejado', {
          ...logContext,
          messageId,
          type: this.rawMessageType(),
        });
        return { notice: policy.messages.unsupportedFormat };
    }
  }

  private async interpretAudio(
    messageId: string,
  ): Promise<WBInterpretedMessage> {
    const organizationId = this.associatedAccount.organizationId;
    const logContext = { 
      organizationId: organizationId, 
      phoneNumber: this.associatedAccount.phoneNumber, 
      userNumber: maskPhone(this.getToNumber()) 
    };
    const defaultWorkflowId = this.associatedAccount.defaultWorkflowId;
    const policy = await this.workflowsService.getMediaPolicy(organizationId, defaultWorkflowId || '');

    if (!policy.audio.enabled) return { notice: policy.messages.audioDisabled };

    let attachment;
    try {
      const source = await this.audioSource();
      if (!source) throw new Error('El mensaje de audio no trae multimedia');

      const { attachments } = await this.mediaProcessingService.processIncomingAttachments(organizationId, [
        {
          type: 'AUDIO',
          sourceUrl: source.url,
          sourceHeaders: source.headers,
          mimeType: source.mimeType,
          sha256: source.sha256,
          maxBytes: maxAudioBytes(policy),
        },
      ]);
      attachment = attachments?.[0];
    } catch (error) {
      // Resolver o bajar la multimedia falló antes de llegar a la transcripción; se trata
      // igual que una transcripción fallida.
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error('No se pudo obtener el audio', { ...logContext, messageId, error: detail });
      return { notice: policy.messages.audioFailed, mediaError: detail };
    }

    if (attachment?.tooLarge) {
      this.logger.warn('Audio rechazado por exceder el límite', {
        ...logContext,
        messageId,
        sizeBytes: attachment.sizeBytes,
        // Aproximado: el webhook no trae la duración, se deriva del tamaño. Sirve
        // para entender de un vistazo si el límite está bien calibrado.
        approxSeconds: attachment.sizeBytes
          ? approximateAudioSeconds(attachment.sizeBytes)
          : undefined,
        maxSeconds: policy.audio.maxSeconds,
      });
      return { notice: policy.messages.audioTooLong };
    }

    if (!attachment?.processedText) {
      // Avisar aunque la ventana traiga texto además del audio: si no, se contestaría al
      // texto y la nota de voz moriría en silencio.
      const detail = attachment?.processingError ?? 'STT sin texto';
      this.logger.error('Falló la transcripción de un audio', {
        ...logContext,
        messageId,
        error: attachment?.processingError,
      });
      return { notice: policy.messages.audioFailed, mediaError: detail };
    }

    return { text: attachment.processedText, attachment };
  }

  /** Node baja a minúsculas los nombres de header, pero el llamador puede pasarlos como quiera. */
  protected headerValue(headers: object, name: string): string {
    const wanted = name.toLowerCase();
    for (const [key, value] of Object.entries(headers ?? {})) {
      if (key.toLowerCase() !== wanted) continue;
      return (Array.isArray(value) ? value[0] : value)?.toString() ?? '';
    }
    return '';
  }

  /** Comparación en tiempo constante; `timingSafeEqual` exige buffers de igual longitud. */
  protected safeEqual(received: string, expected: string): boolean {
    const receivedBuffer = Buffer.from(received, 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    if (receivedBuffer.length !== expectedBuffer.length) return false;
    return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
  }
}
