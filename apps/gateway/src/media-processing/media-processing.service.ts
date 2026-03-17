import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { MEDIA_PROCESSOR_ADAPTER, MediaProcessorAdapter } from './adapters/media-processor.adapter';

export type IncomingAttachment = {
  type: 'IMAGE' | 'AUDIO';
  mimeType: string;
  sourceUrl: string;
  sha256?: string;
  metadata?: Record<string, any>;
};

export type ProcessedAttachment = IncomingAttachment & {
  contentHash: string;
  processingStatus: 'PENDING' | 'PROCESSING' | 'PROCESSED' | 'FAILED' | 'UNSUPPORTED';
  processedText?: string;
  processedAt?: Date;
  processingError?: string;
  processor?: string;
  processorVersion?: string;
};

@Injectable()
export class MediaProcessingService {
  constructor(
    @Inject(MEDIA_PROCESSOR_ADAPTER)
    private readonly adapter: MediaProcessorAdapter,
  ) {}

  async processIncomingAttachments(attachments?: IncomingAttachment[]): Promise<{
    attachments?: ProcessedAttachment[];
    derivedText?: string;
  }> {
    if (!attachments || attachments.length === 0) {
      return {};
    }

    const processed = await Promise.all(
      attachments.map(async (attachment) => {
        const contentHash = createHash('sha256')
          .update(`${attachment.type}:${attachment.sourceUrl}:${attachment.sha256 ?? ''}`)
          .digest('hex');

        const result = await this.adapter.process(attachment);

        if (result.status === 'FAILED') {
          return {
            ...attachment,
            contentHash,
            processingStatus: 'FAILED' as const,
            processingError: result.error ?? 'Unknown media processing error',
            processor: result.processor,
            processorVersion: result.processorVersion,
            metadata: {
              ...(attachment.metadata ?? {}),
              ...(result.metadata ?? {}),
            },
          };
        }

        return {
          ...attachment,
          contentHash,
          processingStatus: 'PROCESSED' as const,
          processedText: result.processedText,
          processedAt: new Date(),
          processor: result.processor,
          processorVersion: result.processorVersion,
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
}
