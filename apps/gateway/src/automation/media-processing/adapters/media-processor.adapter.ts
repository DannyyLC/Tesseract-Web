export type MediaType = 'IMAGE' | 'AUDIO';

export const MEDIA_PROCESSOR_ADAPTER = 'MEDIA_PROCESSOR_ADAPTER';

/** El archivo supera el tope configurado; se distingue de un fallo de red o del modelo. */
export class MediaTooLargeError extends Error {
  constructor(
    readonly sizeBytes: number,
    readonly maxBytes: number,
  ) {
    super(`Media de ${sizeBytes} bytes excede el máximo de ${maxBytes}`);
    this.name = 'MediaTooLargeError';
  }
}

export interface MediaProcessResult {
  /** `TOO_LARGE` merece su propio estado: no es un error nuestro y el mensaje al
   *  usuario es distinto ("mándame uno más corto" en vez de "no pude escucharlo"). */
  status: 'PROCESSED' | 'FAILED' | 'TOO_LARGE';
  processedText?: string;
  error?: string;
  processor: string;
  processorVersion: string;
  /** Tamaño real del archivo descargado, para poder guardarlo y medir después. */
  sizeBytes?: number;
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
    /** Tope de tamaño. Se comprueba antes de descargar cuando el servidor lo declara. */
    maxBytes?: number;
  }): Promise<MediaProcessResult>;
}
