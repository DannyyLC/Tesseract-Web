import { Injectable } from '@nestjs/common';
import { MediaProcessorAdapter, MediaProcessResult } from './media-processor.adapter';

@Injectable()
export class BasicMediaProcessorAdapter implements MediaProcessorAdapter {
  process(media: {
    type: 'IMAGE' | 'AUDIO';
    sourceUrl: string;
    mimeType: string;
    sha256?: string;
    metadata?: Record<string, any>;
  }): Promise<MediaProcessResult> {
    // MVP adapter: dejar resultado determinista y trazable.
    // El reemplazo por OCR/STT real solo requiere cambiar este adapter.
    if (!media.sourceUrl) {
      return Promise.resolve({
        status: 'FAILED',
        error: 'Media source URL is missing',
        processor: 'basic-media-processor',
        processorVersion: '1.0.0',
      });
    }

    if (media.type === 'IMAGE') {
      return Promise.resolve({
        status: 'PROCESSED',
        processedText: 'Imagen recibida del usuario.',
        processor: 'basic-media-processor',
        processorVersion: '1.0.0',
        metadata: {
          strategy: 'placeholder-ocr',
          mimeType: media.mimeType,
        },
      });
    }

    return Promise.resolve({
      status: 'PROCESSED',
      processedText: 'Audio recibido del usuario.',
      processor: 'basic-media-processor',
      processorVersion: '1.0.0',
      metadata: {
        strategy: 'placeholder-stt',
        mimeType: media.mimeType,
      },
    });
  }

  transcribeBuffer(audio: {
    buffer: Buffer;
    mimeType: string;
    metadata?: Record<string, any>;
  }): Promise<MediaProcessResult> {
    return Promise.resolve({
      status: 'PROCESSED',
      processedText: 'Audio recibido del usuario.',
      processor: 'basic-media-processor',
      processorVersion: '1.0.0',
      sizeBytes: audio.buffer.length,
      metadata: {
        ...(audio.metadata ?? {}),
        strategy: 'placeholder-stt',
        mimeType: audio.mimeType,
      },
    });
  }
}
