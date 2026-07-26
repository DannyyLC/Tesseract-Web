import {
  DEFAULT_MEDIA_POLICY,
  approximateAudioSeconds,
  maxAudioBytes,
  resolveMediaPolicy,
} from './media-policy';

describe('resolveMediaPolicy', () => {
  it('apaga todos los tipos cuando el workflow no configura nada', () => {
    // El default importa: procesar media cuesta dinero y debe ser opt-in explícito.
    for (const config of [null, undefined, {}, { mediaProcessing: null }]) {
      const policy = resolveMediaPolicy(config);

      expect(policy.audio.enabled).toBe(false);
      expect(policy.image.enabled).toBe(false);
      expect(policy.video.enabled).toBe(false);
    }
  });

  it('usa los mensajes por defecto cuando no vienen', () => {
    const policy = resolveMediaPolicy({});

    expect(policy.messages).toEqual(DEFAULT_MEDIA_POLICY.messages);
  });

  it('mezcla lo configurado sobre los defaults sin perder lo que falta', () => {
    const policy = resolveMediaPolicy({
      mediaProcessing: {
        audio: { enabled: true },
        messages: { audioDisabled: 'Mensaje del cliente' },
      },
    });

    expect(policy.audio.enabled).toBe(true);
    // No vino maxSeconds: cae al default en vez de quedar en undefined.
    expect(policy.audio.maxSeconds).toBe(DEFAULT_MEDIA_POLICY.audio.maxSeconds);
    expect(policy.messages.audioDisabled).toBe('Mensaje del cliente');
    // Los demás mensajes siguen siendo los nuestros.
    expect(policy.messages.videoDisabled).toBe(DEFAULT_MEDIA_POLICY.messages.videoDisabled);
  });

  it('ignora mensajes vacíos para no dejar al usuario sin respuesta', () => {
    const policy = resolveMediaPolicy({
      mediaProcessing: { messages: { audioDisabled: '   ' } },
    });

    expect(policy.messages.audioDisabled).toBe(DEFAULT_MEDIA_POLICY.messages.audioDisabled);
  });

  it('descarta límites inválidos y cae al default', () => {
    const policy = resolveMediaPolicy({
      mediaProcessing: {
        audio: { enabled: true, maxSeconds: 0 },
        image: { enabled: true, maxBytes: -1 },
      },
    });

    expect(policy.audio.maxSeconds).toBe(DEFAULT_MEDIA_POLICY.audio.maxSeconds);
    expect(policy.image.maxBytes).toBe(DEFAULT_MEDIA_POLICY.image.maxBytes);
  });

  it('define un mensaje para cada forma de fallar, sin dejar ninguno vacío', () => {
    // El objetivo es que ningún camino termine en silencio: si un caso no tiene texto,
    // el usuario se queda esperando una respuesta que nunca llega.
    const policy = resolveMediaPolicy({});

    for (const [key, value] of Object.entries(policy.messages)) {
      expect(typeof value).toBe('string');
      expect(value.trim().length).toBeGreaterThan(0);
      expect(key).toBeTruthy();
    }
  });

  it('respeta una política completamente definida', () => {
    const policy = resolveMediaPolicy({
      mediaProcessing: {
        audio: { enabled: true, maxSeconds: 60 },
        image: { enabled: true, maxBytes: 1024 },
        video: { enabled: true },
        ocrPrompt: 'Extrae el total',
      },
    });

    expect(policy.audio).toEqual({ enabled: true, maxSeconds: 60 });
    expect(policy.image).toEqual({ enabled: true, maxBytes: 1024 });
    expect(policy.video.enabled).toBe(true);
    expect(policy.ocrPrompt).toBe('Extrae el total');
  });
});

describe('maxAudioBytes', () => {
  it('convierte segundos a bytes con el bitrate asumido', () => {
    const policy = resolveMediaPolicy({ mediaProcessing: { audio: { maxSeconds: 60 } } });

    // 60s a 32 kbps = 240 000 bytes.
    expect(maxAudioBytes(policy)).toBe(240_000);
  });

  it('es la inversa aproximada de approximateAudioSeconds', () => {
    const policy = resolveMediaPolicy({ mediaProcessing: { audio: { maxSeconds: 300 } } });

    expect(approximateAudioSeconds(maxAudioBytes(policy))).toBe(300);
  });
});
