import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MediaProcessorAdapter,
  MediaProcessResult,
  MediaTooLargeError,
} from './media-processor.adapter';
import { parseJsonObjectEnv } from '@/platform/common/utils/parse-json-env';

/**
 * Un modelo de OCR con su propio proveedor: URL, llave y parámetros extra. Principal y
 * fallback se configuran por separado, así que pueden ser de proveedores distintos (p.ej.
 * OpenAI y Anthropic por su endpoint compatible con OpenAI) y cambiarlos es solo env.
 */
interface OcrSlot {
  model: string;
  baseUrl: string;
  apiKey: string;
  /** Se mezcla en el body: p.ej. `{"reasoning_effort":"none"}` (MEDIA_PROCESSING_OCR_EXTRA_PARAMS). */
  extraParams: Record<string, unknown>;
}

@Injectable()
export class OpenAiCompatibleMediaProcessorAdapter implements MediaProcessorAdapter {
  private readonly apiBaseUrl: string;
  private readonly apiKey: string;
  private readonly sttModels: string[];
  private readonly ocrSlots: OcrSlot[];
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.apiBaseUrl = this.normalizeBaseUrl(
      this.configService.get<string>('MEDIA_PROCESSING_API_BASE_URL', 'https://api.openai.com/v1'),
    );
    this.apiKey = this.configService.get<string>('MEDIA_PROCESSING_API_KEY', '');
    const sttPrimary = this.configService.get<string>('MEDIA_PROCESSING_STT_MODEL', 'gpt-transcribe');
    const sttFallback = this.configService.get<string>('MEDIA_PROCESSING_STT_FALLBACK_MODEL', '');
    this.sttModels = this.buildModelChain(sttPrimary, sttFallback);

    this.ocrSlots = this.buildOcrSlots();

    this.timeoutMs = this.configService.get<number>('MEDIA_PROCESSING_TIMEOUT_MS', 30000);
  }

  /**
   * Principal y fallback de OCR. Lo que no se configure por slot cae en lo general
   * (`MEDIA_PROCESSING_API_BASE_URL` / `_API_KEY`), y el fallback en lo del principal, así que
   * un despliegue que solo usa OpenAI no necesita ninguna variable nueva.
   */
  private buildOcrSlots(): OcrSlot[] {
    const get = (name: string) => this.configService.get<string>(name, '')?.trim() ?? '';

    const primary: OcrSlot = {
      model: get('MEDIA_PROCESSING_OCR_MODEL') || 'gpt-6-luna',
      baseUrl: this.normalizeBaseUrl(get('MEDIA_PROCESSING_OCR_API_BASE_URL') || this.apiBaseUrl),
      apiKey: get('MEDIA_PROCESSING_OCR_API_KEY') || this.apiKey,
      extraParams: parseJsonObjectEnv(
        'MEDIA_PROCESSING_OCR_EXTRA_PARAMS',
        get('MEDIA_PROCESSING_OCR_EXTRA_PARAMS'),
      ),
    };

    const fallbackModel = get('MEDIA_PROCESSING_OCR_FALLBACK_MODEL');
    if (!fallbackModel) return [primary];

    const fallback: OcrSlot = {
      model: fallbackModel,
      baseUrl: this.normalizeBaseUrl(
        get('MEDIA_PROCESSING_OCR_FALLBACK_API_BASE_URL') || primary.baseUrl,
      ),
      apiKey: get('MEDIA_PROCESSING_OCR_FALLBACK_API_KEY') || primary.apiKey,
      extraParams: parseJsonObjectEnv(
        'MEDIA_PROCESSING_OCR_FALLBACK_EXTRA_PARAMS',
        get('MEDIA_PROCESSING_OCR_FALLBACK_EXTRA_PARAMS'),
      ),
    };

    const same = fallback.model === primary.model && fallback.baseUrl === primary.baseUrl;
    return same ? [primary] : [primary, fallback];
  }

  async process(media: {
    type: 'IMAGE' | 'AUDIO';
    sourceUrl: string;
    sourceHeaders?: Record<string, string>;
    mimeType: string;
    sha256?: string;
    metadata?: Record<string, unknown>;
    customOcrPrompt?: string;
    maxBytes?: number;
  }): Promise<MediaProcessResult> {
    const missingKey =
      media.type === 'AUDIO' ? !this.apiKey : this.ocrSlots.every((slot) => !slot.apiKey);
    if (missingKey) {
      return {
        status: 'FAILED',
        error:
          media.type === 'AUDIO'
            ? 'MEDIA_PROCESSING_API_KEY is not configured'
            : 'No OCR API key configured (MEDIA_PROCESSING_OCR_API_KEY / MEDIA_PROCESSING_API_KEY)',
        processor: 'openai-compatible-media-processor',
        processorVersion: '1.0.0',
      };
    }

    try {
      if (media.type === 'AUDIO') {
        const { 
          text: processedText, 
          modelUsed, 
          sizeBytes 
        } = await this.transcribeAudio(
          media.sourceUrl,
          media.mimeType,
          media.maxBytes,
          media.sourceHeaders,
        );
        return {
          status: 'PROCESSED',
          processedText,
          processor: 'openai-compatible-media-processor',
          processorVersion: '1.0.0',
          sizeBytes,
          metadata: {
            strategy: 'stt',
            model: modelUsed,
            fallbackConfigured: this.sttModels.length > 1,
            mimeType: media.mimeType,
          },
        };
      }

      const { text: processedText, modelUsed } = await this.extractImageText(
        media.sourceUrl,
        media.mimeType,
        media.customOcrPrompt,
        media.maxBytes,
        media.sourceHeaders,
      );
      return {
        status: 'PROCESSED',
        processedText,
        processor: 'openai-compatible-media-processor',
        processorVersion: '1.0.0',
        metadata: {
          strategy: 'vision-ocr',
          model: modelUsed,
          fallbackConfigured: this.ocrSlots.length > 1,
          mimeType: media.mimeType,
        },
      };
    } catch (error) {
      if (error instanceof MediaTooLargeError) {
        return {
          status: 'TOO_LARGE',
          error: error.message,
          processor: 'openai-compatible-media-processor',
          processorVersion: '1.0.0',
          sizeBytes: error.sizeBytes,
        };
      }

      return {
        status: 'FAILED',
        error: (error as Error).message,
        processor: 'openai-compatible-media-processor',
        processorVersion: '1.0.0',
      };
    }
  }

  /**
   * Transcribe audio ya cargado en memoria.
   *
   * Es el punto en común entre las notas de voz de WhatsApp —que se descargan de una
   * URL— y el dictado del navegador, que llega directo en el cuerpo de la petición.
   * Ambos acaban aquí, así que comparten cadena de modelos, respaldo y timeout.
   */
  async transcribeBuffer(audio: {
    buffer: Buffer;
    mimeType: string;
    metadata?: Record<string, unknown>;
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
      const { text, modelUsed, sizeBytes } = await this.transcribeFileBuffer(
        audio.buffer,
        audio.mimeType,
      );

      return {
        status: 'PROCESSED',
        processedText: text,
        processor: 'openai-compatible-media-processor',
        processorVersion: '1.0.0',
        sizeBytes,
        metadata: { ...(audio.metadata ?? {}), modelUsed, mimeType: audio.mimeType },
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
    maxBytes?: number,
    sourceHeaders?: Record<string, string>,
  ): Promise<{ text: string; modelUsed: string; sizeBytes: number }> {
    const fileBuffer = await this.downloadBinary(sourceUrl, maxBytes, sourceHeaders);
    return this.transcribeFileBuffer(fileBuffer, mimeType);
  }

  private async transcribeFileBuffer(
    fileBuffer: Buffer,
    mimeType: string,
  ): Promise<{ text: string; modelUsed: string; sizeBytes: number }> {
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
          text:
            payload.text?.trim() || 'Audio recibido, pero no se pudo transcribir contenido util.',
          modelUsed: model,
          sizeBytes: fileBuffer.length,
        };
      } catch (error) {
        lastError = error as Error;
      }
    }

    throw new Error(lastError?.message || 'STT request failed for all configured models');
  }

  /**
   * La imagen se descarga aquí y viaja como data URI en base64. Antes se le pasaba al proveedor
   * la URL de YCloud: si expiraba, o si el proveedor no podía descargarla (no todos lo hacen
   * igual), el OCR fallaba de forma intermitente.
   *
   * Sin `temperature`: los modelos de razonamiento (gpt-5+) solo aceptan la default y los
   * Claude 5.5 rechazan cualquiera. Lo que haga falta ajustar va en `extraParams`.
   */
  private async extractImageText(
    sourceUrl: string,
    mimeType: string,
    customPrompt?: string,
    maxBytes?: number,
    sourceHeaders?: Record<string, string>,
  ): Promise<{ text: string; modelUsed: string }> {
    let lastError: Error | null = null;

    const userPrompt =
      customPrompt?.trim() || 'Extrae texto y resume contenido visual clave en maximo 6 lineas.';

    const image = await this.downloadBinary(sourceUrl, maxBytes, sourceHeaders);
    const dataUri = `data:${mimeType || 'image/jpeg'};base64,${image.toString('base64')}`;

    for (const slot of this.ocrSlots) {
      // Un slot sin llave no se puede usar, pero el otro quizá sí.
      if (!slot.apiKey) continue;
      const model = slot.model;
      try {
        const response = await this.fetchWithTimeout(`${slot.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${slot.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...slot.extraParams,
            model,
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
                    text: userPrompt,
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: dataUri,
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
          choices?: { message?: { content?: string | { type?: string; text?: string }[] } }[];
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
            .map((part) => (part.text ?? '').trim())
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

  /**
   * Descarga el binario, opcionalmente con un tope de tamaño.
   *
   * El tope se comprueba con `Content-Length` ANTES de consumir el cuerpo: así un audio
   * de media hora se rechaza sin descargarlo y sin pagar la transcripción. Si el
   * servidor responde sin `Content-Length`, se lee por trozos y se corta al pasarse.
   */
  private async downloadBinary(
    sourceUrl: string,
    maxBytes?: number,
    sourceHeaders?: Record<string, string>,
  ): Promise<Buffer> {
    const response = await this.fetchWithTimeout(sourceUrl, {
      method: 'GET',
      headers: sourceHeaders,
    });

    if (!response.ok) {
      throw new Error(`Media download failed with status ${response.status}`);
    }

    const declaredLength = Number(response.headers.get('content-length'));

    if (maxBytes && Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      await response.body?.cancel();
      throw new MediaTooLargeError(declaredLength, maxBytes);
    }

    if (!maxBytes || !response.body) {
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }

    const chunks: Uint8Array[] = [];
    let total = 0;

    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      total += chunk.length;
      if (total > maxBytes) {
        await response.body.cancel();
        throw new MediaTooLargeError(total, maxBytes);
      }
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
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

  private normalizeBaseUrl(url: string): string {
    return url.replace(/\/$/, '');
  }

  private buildModelChain(primary: string, fallback?: string): string[] {
    const chain = [primary, fallback ?? ''].map((value) => value.trim()).filter(Boolean);

    return [...new Set(chain)];
  }
}
