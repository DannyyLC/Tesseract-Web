import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaProcessorAdapter, MediaProcessResult } from './media-processor.adapter';

@Injectable()
export class OpenAiCompatibleMediaProcessorAdapter implements MediaProcessorAdapter {
  private readonly apiBaseUrl: string;
  private readonly apiKey: string;
  private readonly sttModel: string;
  private readonly ocrModel: string;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.apiBaseUrl = this.configService
      .get<string>('MEDIA_PROCESSING_API_BASE_URL', 'https://api.openai.com/v1')
      .replace(/\/$/, '');
    this.apiKey = this.configService.get<string>('MEDIA_PROCESSING_API_KEY', '');
    this.sttModel = this.configService.get<string>('MEDIA_PROCESSING_STT_MODEL', 'gpt-4o-transcribe');
    this.ocrModel = this.configService.get<string>('MEDIA_PROCESSING_OCR_MODEL', 'gpt-4.1');
    this.timeoutMs = this.configService.get<number>('MEDIA_PROCESSING_TIMEOUT_MS', 30000);
  }

  async process(media: {
    type: 'IMAGE' | 'AUDIO';
    sourceUrl: string;
    mimeType: string;
    sha256?: string;
    metadata?: Record<string, any>;
  }): Promise<MediaProcessResult> {
    if (!this.apiKey) {
      return {
        status: 'FAILED',
        error: 'MEDIA_PROCESSING_API_KEY is not configured',
        processor: 'openai-compatible-media-processor',
        processorVersion: '1.0.0',
      };
    }

    try {
      if (media.type === 'AUDIO') {
        const processedText = await this.transcribeAudio(media.sourceUrl, media.mimeType);
        return {
          status: 'PROCESSED',
          processedText,
          processor: 'openai-compatible-media-processor',
          processorVersion: '1.0.0',
          metadata: {
            strategy: 'stt',
            model: this.sttModel,
            mimeType: media.mimeType,
          },
        };
      }

      const processedText = await this.extractImageText(media.sourceUrl);
      return {
        status: 'PROCESSED',
        processedText,
        processor: 'openai-compatible-media-processor',
        processorVersion: '1.0.0',
        metadata: {
          strategy: 'vision-ocr',
          model: this.ocrModel,
          mimeType: media.mimeType,
        },
      };
    } catch (error) {
      return {
        status: 'FAILED',
        error: (error as Error).message,
        processor: 'openai-compatible-media-processor',
        processorVersion: '1.0.0',
      };
    }
  }

  private async transcribeAudio(sourceUrl: string, mimeType: string): Promise<string> {
    const fileBuffer = await this.downloadBinary(sourceUrl);
    const extension = this.mimeTypeToExtension(mimeType);

    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: mimeType || 'audio/ogg' });
    formData.append('file', blob, `audio.${extension}`);
    formData.append('model', this.sttModel);

    const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`STT request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as { text?: string };
    return payload.text?.trim() || 'Audio recibido, pero no se pudo transcribir contenido útil.';
  }

  private async extractImageText(sourceUrl: string): Promise<string> {
    const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.ocrModel,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              'Eres un extractor OCR confiable. Extrae el texto visible y una breve descripción util de la imagen en español.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extrae texto y resume contenido visual clave en maximo 6 lineas.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: sourceUrl,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OCR request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
    };

    const content = payload.choices?.[0]?.message?.content;
    if (typeof content === 'string') {
      return content.trim() || 'Imagen recibida sin texto extraible.';
    }

    if (Array.isArray(content)) {
      const merged = content
        .filter((part) => part?.type === 'text' && part?.text)
        .map((part) => part.text!.trim())
        .filter(Boolean)
        .join('\n');
      return merged || 'Imagen recibida sin texto extraible.';
    }

    return 'Imagen recibida sin texto extraible.';
  }

  private async downloadBinary(sourceUrl: string): Promise<Buffer> {
    const response = await this.fetchWithTimeout(sourceUrl, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Media download failed with status ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private mimeTypeToExtension(mimeType: string): string {
    if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
    if (mimeType.includes('wav')) return 'wav';
    if (mimeType.includes('mp4')) return 'mp4';
    if (mimeType.includes('ogg')) return 'ogg';
    if (mimeType.includes('webm')) return 'webm';
    return 'bin';
  }
}
