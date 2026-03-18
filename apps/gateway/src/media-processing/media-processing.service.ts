import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { MEDIA_PROCESSOR_ADAPTER, MediaProcessorAdapter } from './adapters/media-processor.adapter';
import { PrismaService } from '../database/prisma.service';

export interface IncomingAttachment {
  type: 'IMAGE' | 'AUDIO';
  mimeType: string;
  sourceUrl: string;
  sha256?: string;
  metadata?: Record<string, any>;
}

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
          
        const contentHash = createHash('sha256')
          .update(hashInput)
          .digest('hex');

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
          },
          orderBy: [{ processedAt: 'desc' }, { createdAt: 'desc' }],
        });

        if (cached?.processedText?.trim()) {
          return {
            ...attachment,
            contentHash,
            processingStatus: 'PROCESSED' as const,
            processedText: cached.processedText,
            processedAt: cached.processedAt ?? new Date(),
            processor: cached.processor ?? 'cache-hit',
            processorVersion: cached.processorVersion ?? '1.0.0',
            metadata: {
              ...(attachment.metadata ?? {}),
              cacheHit: true,
              reusedFromAttachmentId: cached.id,
            },
          };
        }

        const result = await this.adapter.process({
          ...attachment,
          customOcrPrompt,
        });

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
