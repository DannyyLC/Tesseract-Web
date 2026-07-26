/**
 * Política de procesamiento de media por workflow.
 *
 * Vive dentro de `workflow.config.mediaProcessing` (campo JSON), no en columnas, para
 * poder iterar sobre su forma sin migraciones. Cuando se estabilice y haga falta
 * consultarla —"¿qué workflows tienen audio encendido?"— se promueve a columnas.
 *
 * Todo arranca apagado a propósito: transcribir cuesta dinero y un cliente nuevo no
 * debería estrenar factura sin haberlo pedido.
 */

export type MediaKind = 'audio' | 'image' | 'video';

export interface MediaPolicy {
  audio: { enabled: boolean; maxSeconds: number };
  /** `maxBytes` e `imageTooLarge` quedan inertes mientras las imágenes estén
   *  apagadas: nunca se descargan, así que no hay dónde comprobar el tamaño. */
  image: { enabled: boolean; maxBytes: number };
  video: { enabled: boolean };
  messages: {
    audioDisabled: string;
    audioTooLong: string;
    audioFailed: string;
    imageDisabled: string;
    imageTooLarge: string;
    videoDisabled: string;
    /** Para todo lo que no sabemos manejar: stickers, documentos, ubicaciones,
     *  contactos. Antes caían en un `default` que solo dejaba un log y el usuario
     *  se quedaba esperando una respuesta que nunca llegaba. */
    unsupportedFormat: string;
  };
  ocrPrompt?: string;
}

/**
 * Bitrate que asumimos para convertir el límite de segundos a bytes.
 *
 * Las notas de voz de WhatsApp van en Opus, entre 16 y 32 kbps según el dispositivo.
 * Asumimos el extremo alto a propósito: así el error cae del lado permisivo (dejar
 * pasar un audio algo más largo del límite) en vez del molesto (rechazar uno válido de
 * cuatro minutos cuando el cliente configuró cinco).
 *
 * Es una estimación con fecha de caducidad: ahora que se guarda `sizeBytes` en
 * `message_attachments`, se puede calcular el bitrate real con datos propios y ajustar
 * esta variable sin recompilar.
 */
const ASSUMED_AUDIO_BITRATE_KBPS = Number(
  process.env.WHATSAPP_ASSUMED_AUDIO_BITRATE_KBPS ?? 32,
);

export const DEFAULT_MEDIA_POLICY: MediaPolicy = {
  audio: { enabled: false, maxSeconds: 300 },
  image: { enabled: false, maxBytes: 5 * 1024 * 1024 },
  video: { enabled: false },
  messages: {
    audioDisabled: 'Por ahora no puedo escuchar notas de voz, ¿me lo escribes?',
    audioTooLong: 'Ese audio es muy largo para mí. ¿Me mandas uno más corto?',
    audioFailed: 'No pude escuchar tu audio. ¿Me lo puedes mandar de nuevo o escribirlo?',
    imageDisabled: 'Todavía no puedo ver imágenes.',
    imageTooLarge: 'Esa imagen es muy pesada para mí.',
    videoDisabled: 'No puedo ver videos, mándame texto por favor.',
    unsupportedFormat: 'No pude entender ese mensaje. ¿Me lo escribes?',
  },
};

/**
 * Mezcla la configuración del workflow sobre los defaults.
 *
 * Es el único lugar que decide qué pasa cuando falta un campo, para que el worker no
 * tenga que preguntarse si un `undefined` significa "apagado" o "no configurado".
 */
export function resolveMediaPolicy(workflowConfig: unknown): MediaPolicy {
  const raw = (workflowConfig as { mediaProcessing?: Partial<MediaPolicy> } | null)
    ?.mediaProcessing;

  if (!raw || typeof raw !== 'object') {
    return DEFAULT_MEDIA_POLICY;
  }

  return {
    audio: {
      enabled: raw.audio?.enabled ?? DEFAULT_MEDIA_POLICY.audio.enabled,
      maxSeconds: positiveOr(raw.audio?.maxSeconds, DEFAULT_MEDIA_POLICY.audio.maxSeconds),
    },
    image: {
      enabled: raw.image?.enabled ?? DEFAULT_MEDIA_POLICY.image.enabled,
      maxBytes: positiveOr(raw.image?.maxBytes, DEFAULT_MEDIA_POLICY.image.maxBytes),
    },
    video: {
      enabled: raw.video?.enabled ?? DEFAULT_MEDIA_POLICY.video.enabled,
    },
    messages: {
      ...DEFAULT_MEDIA_POLICY.messages,
      ...pickNonEmptyStrings(raw.messages),
    },
    ocrPrompt: raw.ocrPrompt,
  };
}

/** Presupuesto de bytes equivalente al límite de segundos configurado. */
export function maxAudioBytes(policy: MediaPolicy): number {
  return Math.ceil((policy.audio.maxSeconds * ASSUMED_AUDIO_BITRATE_KBPS * 1000) / 8);
}

/** Duración aproximada de un audio, para mensajes y métricas. */
export function approximateAudioSeconds(sizeBytes: number): number {
  return Math.round((sizeBytes * 8) / (ASSUMED_AUDIO_BITRATE_KBPS * 1000));
}

function positiveOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Descarta cadenas vacías para que un mensaje en blanco caiga al default en vez de
 * dejar al usuario con una respuesta vacía.
 */
function pickNonEmptyStrings(
  messages: Partial<MediaPolicy['messages']> | undefined,
): Partial<MediaPolicy['messages']> {
  if (!messages || typeof messages !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(messages).filter(
      ([, value]) => typeof value === 'string' && value.trim().length > 0,
    ),
  ) as Partial<MediaPolicy['messages']>;
}
