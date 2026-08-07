import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { MEDIA_PROCESSOR_ADAPTER, MediaProcessorAdapter } from './adapters/media-processor.adapter';
import { PrismaService } from '@/platform/database/prisma.service';
import { MediaPolicy, maxAudioBytes } from './media-policy';

export interface IncomingAttachment {
  type: 'IMAGE' | 'AUDIO';
  mimeType: string;
  sourceUrl: string;
  sha256?: string;
  metadata?: Record<string, any>;
  /** Tope de tamaño para este adjunto. Lo fija la política del workflow. */
  maxBytes?: number;
}

export type ProcessedAttachment = Omit<IncomingAttachment, 'maxBytes'> & {
  contentHash: string;
  processingStatus: 'PENDING' | 'PROCESSING' | 'PROCESSED' | 'FAILED' | 'UNSUPPORTED';
  processedText?: string;
  processedAt?: Date;
  processingError?: string;
  processor?: string;
  processorVersion?: string;
  sizeBytes?: number;
  /** `true` cuando el archivo excedió el tope; el mensaje al usuario es distinto. */
  tooLarge?: boolean;
};

/**
 * Deja un adjunto listo para persistir.
 *
 * `ProcessedAttachment` lleva campos de trabajo (`tooLarge`) que no existen como
 * columna; pasarlos tal cual a Prisma revienta. Este mapeo explícito es la frontera
 * entre lo que se calcula y lo que se guarda.
 */
export function toAttachmentInput(attachment: ProcessedAttachment) {
  return {
    type: attachment.type,
    mimeType: attachment.mimeType,
    sourceUrl: attachment.sourceUrl,
    sha256: attachment.sha256,
    contentHash: attachment.contentHash,
    processingStatus: attachment.processingStatus,
    processedText: attachment.processedText,
    processedAt: attachment.processedAt,
    processingError: attachment.processingError,
    processor: attachment.processor,
    processorVersion: attachment.processorVersion,
    sizeBytes: attachment.sizeBytes,
    metadata: attachment.metadata,
  };
}

/** Motivos por los que un dictado se rechaza sin llegar a costar una transcripción. */
export type DictationRejection = 'AUDIO_DISABLED' | 'AUDIO_TOO_LONG' | 'EMPTY_AUDIO';

export type DictationResult =
  | { status: 'PROCESSED'; text: string }
  | { status: 'REJECTED'; reason: DictationRejection; message: string }
  | { status: 'FAILED'; message: string };

@Injectable()
export class MediaProcessingService {
  constructor(
    @Inject(MEDIA_PROCESSOR_ADAPTER)
    private readonly adapter: MediaProcessorAdapter,
    private readonly prisma: PrismaService,
  ) {}

  async processIncomingAttachments(
    organizationId: string,
    attachments?: IncomingAttachment[],
    customOcrPrompt?: string,
  ): Promise<{
    attachments?: ProcessedAttachment[];
    derivedText?: string;
  }> {
    if (!attachments || attachments.length === 0) {
      return {};
    }

    const processed = await Promise.all(
      attachments.map(async (attachment) => {
        const hashInput = attachment.sha256
          ? `${attachment.type}:${attachment.sha256}`
          : `${attachment.type}:${attachment.sourceUrl}`;

        const contentHash = createHash('sha256').update(hashInput).digest('hex');

        const cached = await this.prisma.messageAttachment.findFirst({
          where: {
            organizationId,
            contentHash,
            processingStatus: 'PROCESSED',
            processedText: {
              not: null,
            },
          },
          select: {
            id: true,
            processedText: true,
            processedAt: true,
            processor: true,
            processorVersion: true,
            sizeBytes: true,
          },
          orderBy: [{ processedAt: 'desc' }, { createdAt: 'desc' }],
        });

        if (cached?.processedText?.trim()) {
          // Acierto de caché: el mismo audio ya fue transcrito (el hash sale del sha256
          // que manda WhatsApp). Se reutiliza sin volver a pagar la transcripción.
          const { maxBytes: _ignored, ...persistable } = attachment;

          return {
            ...persistable,
            contentHash,
            processingStatus: 'PROCESSED' as const,
            processedText: cached.processedText,
            processedAt: cached.processedAt ?? new Date(),
            processor: cached.processor ?? 'cache-hit',
            processorVersion: cached.processorVersion ?? '1.0.0',
            sizeBytes: cached.sizeBytes ?? undefined,
            metadata: {
              ...(attachment.metadata ?? {}),
              cacheHit: true,
              reusedFromAttachmentId: cached.id,
            },
          };
        }

        const { maxBytes, ...persistable } = attachment;

        const result = await this.adapter.process({
          ...attachment,
          customOcrPrompt,
        });

        if (result.status === 'TOO_LARGE') {
          return {
            ...persistable,
            contentHash,
            processingStatus: 'UNSUPPORTED' as const,
            processingError: result.error,
            processor: result.processor,
            processorVersion: result.processorVersion,
            sizeBytes: result.sizeBytes,
            tooLarge: true,
            metadata: { ...(attachment.metadata ?? {}), ...(result.metadata ?? {}) },
          };
        }

        if (result.status === 'FAILED') {
          return {
            ...persistable,
            contentHash,
            processingStatus: 'FAILED' as const,
            processingError: result.error ?? 'Unknown media processing error',
            processor: result.processor,
            processorVersion: result.processorVersion,
            sizeBytes: result.sizeBytes,
            metadata: {
              ...(attachment.metadata ?? {}),
              ...(result.metadata ?? {}),
            },
          };
        }

        return {
          ...persistable,
          contentHash,
          processingStatus: 'PROCESSED' as const,
          processedText: result.processedText,
          processedAt: new Date(),
          processor: result.processor,
          processorVersion: result.processorVersion,
          sizeBytes: result.sizeBytes,
          metadata: {
            ...(attachment.metadata ?? {}),
            ...(result.metadata ?? {}),
          },
        };
      }),
    );

    const derivedText = processed
      .map((a) => ('processedText' in a ? a.processedText : undefined))
      .filter((text): text is string => Boolean(text))
      .join('\n')
      .trim();

    return {
      attachments: processed,
      derivedText: derivedText || undefined,
    };
  }

  /**
   * Transcribe un dictado grabado en el navegador.
   *
   * A diferencia de una nota de voz de WhatsApp, aquí el audio es solo un método de
   * entrada: se transcribe, se devuelve el texto y el binario se descarta. No se
   * almacena ni se cachea —cada grabación es un archivo distinto, así que la caché
   * por hash nunca acertaría— y nunca llega a existir como adjunto de un mensaje.
   *
   * El límite de duración de la política se aplica sobre el tamaño, igual que en
   * WhatsApp: es una estimación, pero evita pagar una transcripción larga que el
   * cliente no contrató.
   */
  async transcribeDictation(input: {
    buffer: Buffer;
    mimeType: string;
    policy: MediaPolicy;
  }): Promise<DictationResult> {
    const { buffer, mimeType, policy } = input;

    if (!policy.audio.enabled) {
      return {
        status: 'REJECTED',
        reason: 'AUDIO_DISABLED',
        message: policy.messages.audioDisabled,
      };
    }

    if (buffer.length === 0) {
      return { status: 'REJECTED', reason: 'EMPTY_AUDIO', message: policy.messages.audioFailed };
    }

    if (buffer.length > maxAudioBytes(policy)) {
      return { status: 'REJECTED', reason: 'AUDIO_TOO_LONG', message: policy.messages.audioTooLong };
    }

    const result = await this.adapter.transcribeBuffer({
      buffer,
      mimeType,
      metadata: { source: 'web-dictation' },
    });

    if (result.status !== 'PROCESSED' || !result.processedText?.trim()) {
      return { status: 'FAILED', message: policy.messages.audioFailed };
    }

    return { status: 'PROCESSED', text: result.processedText.trim() };
  }
}
