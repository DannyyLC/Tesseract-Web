export type MediaType = 'IMAGE' | 'AUDIO';

export const MEDIA_PROCESSOR_ADAPTER = 'MEDIA_PROCESSOR_ADAPTER';

export interface MediaProcessResult {
  status: 'PROCESSED' | 'FAILED';
  processedText?: string;
  error?: string;
  processor: string;
  processorVersion: string;
  metadata?: Record<string, any>;
}

export interface MediaProcessorAdapter {
  process(media: {
    type: MediaType;
    sourceUrl: string;
    mimeType: string;
    sha256?: string;
    metadata?: Record<string, any>;
    customOcrPrompt?: string;
  }): Promise<MediaProcessResult>;
}
