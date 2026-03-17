export type MediaType = 'IMAGE' | 'AUDIO';

export type MediaProcessResult = {
  status: 'PROCESSED' | 'FAILED';
  processedText?: string;
  error?: string;
  processor: string;
  processorVersion: string;
  metadata?: Record<string, any>;
};

export interface MediaProcessorAdapter {
  process(media: {
    type: MediaType;
    sourceUrl: string;
    mimeType: string;
    sha256?: string;
    metadata?: Record<string, any>;
  }): Promise<MediaProcessResult>;
}
