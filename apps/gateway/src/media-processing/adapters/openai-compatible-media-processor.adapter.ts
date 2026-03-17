import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaProcessorAdapter, MediaProcessResult } from './media-processor.adapter';

@Injectable()
export class OpenAiCompatibleMediaProcessorAdapter implements MediaProcessorAdapter {
  private readonly apiBaseUrl: string;
  private readonly apiKey: string;
  private readonly sttModels: string[];
  private readonly ocrModels: string[];
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.apiBaseUrl = this.configService
      .get<string>('MEDIA_PROCESSING_API_BASE_URL', 'https://api.openai.com/v1')
      .replace(/\/$/, '');
    this.apiKey = this.configService.get<string>('MEDIA_PROCESSING_API_KEY', '');
    const sttPrimary = this.configService.get<string>('MEDIA_PROCESSING_STT_MODEL', 'gpt-4o-transcribe');
    const sttFallback = this.configService.get<string>('MEDIA_PROCESSING_STT_FALLBACK_MODEL', '');
    this.sttModels = this.buildModelChain(sttPrimary, sttFallback);

    const ocrPrimary = this.configService.get<string>('MEDIA_PROCESSING_OCR_MODEL', 'gpt-4.1');
    const ocrFallback = this.configService.get<string>('MEDIA_PROCESSING_OCR_FALLBACK_MODEL', '');
    this.ocrModels = this.buildModelChain(ocrPrimary, ocrFallback);

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
        const { text: processedText, modelUsed } = await this.transcribeAudio(
          media.sourceUrl,
          media.mimeType,
        );
        return {
          status: 'PROCESSED',
          processedText,
          processor: 'openai-compatible-media-processor',
          processorVersion: '1.0.0',
          metadata: {
            strategy: 'stt',
            model: modelUsed,
            fallbackConfigured: this.sttModels.length > 1,
            mimeType: media.mimeType,
          },
        };
      }

      const { text: processedText, modelUsed } = await this.extractImageText(media.sourceUrl);
      return {
        status: 'PROCESSED',
        processedText,
        processor: 'openai-compatible-media-processor',
        processorVersion: '1.0.0',
        metadata: {
          strategy: 'vision-ocr',
          model: modelUsed,
          fallbackConfigured: this.ocrModels.length > 1,
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

  private async transcribeAudio(
    sourceUrl: string,
    mimeType: string,
  ): Promise<{ text: string; modelUsed: string }> {
    const fileBuffer = await this.downloadBinary(sourceUrl);
    const extension = this.mimeTypeToExtension(mimeType);

    let lastError: Error | null = null;

    for (const model of this.sttModels) {
      try {
        const formData = new FormData();
        const blob = new Blob([fileBuffer], { type: mimeType || 'audio/ogg' });
        formData.append('file', blob, `audio.${extension}`);
        formData.append('model', model);

        const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/audio/transcriptions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`STT request failed for model ${model} with status ${response.status}`);
        }

        const payload = (await response.json()) as { text?: string };
        return {
          text: payload.text?.trim() || 'Audio recibido, pero no se pudo transcribir contenido util.',
          modelUsed: model,
        };
      } catch (error) {
        lastError = error as Error;
      }
    }

    throw new Error(lastError?.message || 'STT request failed for all configured models');
  }

  private async extractImageText(sourceUrl: string): Promise<{ text: string; modelUsed: string }> {
    let lastError: Error | null = null;

    for (const model of this.ocrModels) {
      try {
        const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            temperature: 0,
            messages: [
              {
                role: 'system',
                content:
                  'Eres un extractor OCR confiable. Extrae el texto visible y una breve descripcion util de la imagen en espanol.',
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
          throw new Error(`OCR request failed for model ${model} with status ${response.status}`);
        }

        const payload = (await response.json()) as {
          choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
        };

        const content = payload.choices?.[0]?.message?.content;
        if (typeof content === 'string') {
          return {
            text: content.trim() || 'Imagen recibida sin texto extraible.',
            modelUsed: model,
          };
        }

        if (Array.isArray(content)) {
          const merged = content
            .filter((part) => part?.type === 'text' && part?.text)
            .map((part) => part.text!.trim())
            .filter(Boolean)
            .join('\n');
          return {
            text: merged || 'Imagen recibida sin texto extraible.',
            modelUsed: model,
          };
        }

        return {
          text: 'Imagen recibida sin texto extraible.',
          modelUsed: model,
        };
      } catch (error) {
        lastError = error as Error;
      }
    }

    throw new Error(lastError?.message || 'OCR request failed for all configured models');
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

  private buildModelChain(primary: string, fallback?: string): string[] {
    const chain = [primary, fallback ?? '']
      .map((value) => value.trim())
      .filter(Boolean);

    return [...new Set(chain)];
  }
}
