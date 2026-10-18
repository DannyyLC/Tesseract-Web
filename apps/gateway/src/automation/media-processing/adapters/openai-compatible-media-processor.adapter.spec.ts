import { ConfigService } from '@nestjs/config';
import { OpenAiCompatibleMediaProcessorAdapter } from './openai-compatible-media-processor.adapter';

/**
 * OCR con principal y fallback configurables por separado (URL, llave y parámetros extra),
 * para poder mezclar proveedores y cambiar de modelo solo con variables de entorno.
 */
const build = (env: Record<string, string>) =>
  new OpenAiCompatibleMediaProcessorAdapter({
    get: (name: string, fallback?: unknown) => env[name] ?? fallback,
  } as unknown as ConfigService);

const IMAGE = Buffer.from('fake-png');

const urlOf = (input: string | URL | Request) =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

/** fetch simulado: la descarga de la imagen y luego las respuestas de OCR en orden. */
function mockFetch(ocrResponses: { ok: boolean; status?: number; text?: string }[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const queue = [...ocrResponses];
  jest.spyOn(global, 'fetch').mockImplementation((input, init) => {
    const url = urlOf(input);
    calls.push({ url, init });
    if (url.startsWith('https://media.example')) {
      return Promise.resolve(new Response(IMAGE, { status: 200 }));
    }
    const next = queue.shift() ?? { ok: false, status: 500 };
    return Promise.resolve(
      new Response(JSON.stringify({ choices: [{ message: { content: next.text ?? '' } }] }), {
        status: next.ok ? 200 : (next.status ?? 500),
      }),
    );
  });
  return calls;
}

const processImage = (adapter: OpenAiCompatibleMediaProcessorAdapter) =>
  adapter.process({
    type: 'IMAGE',
    sourceUrl: 'https://media.example/img.png',
    mimeType: 'image/png',
  });

const bodyOf = (call: { init?: RequestInit }) => JSON.parse(call.init?.body as string);
const authOf = (call: { init?: RequestInit }) =>
  (call.init?.headers as Record<string, string>).Authorization;

afterEach(() => jest.restoreAllMocks());

describe('OpenAiCompatibleMediaProcessorAdapter — OCR', () => {
  it('sin variables de OCR usa las generales y el default vigente, sin temperature', async () => {
    const calls = mockFetch([{ ok: true, text: 'Factura 123' }]);
    const adapter = build({
      MEDIA_PROCESSING_API_BASE_URL: 'https://api.openai.com/v1/',
      MEDIA_PROCESSING_API_KEY: 'sk-general',
    });

    const result = await processImage(adapter);

    expect(result).toMatchObject({ status: 'PROCESSED', processedText: 'Factura 123' });
    const ocr = calls[1];
    expect(ocr.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(authOf(ocr)).toBe('Bearer sk-general');
    const body = bodyOf(ocr);
    expect(body.model).toBe('gpt-6-luna');
    expect(body).not.toHaveProperty('temperature');
  });

  it('manda la imagen descargada como data URI, no la URL de origen', async () => {
    const calls = mockFetch([{ ok: true, text: 'ok' }]);
    await processImage(build({ MEDIA_PROCESSING_API_KEY: 'sk' }));

    const imagePart = bodyOf(calls[1]).messages[1].content[1];
    expect(imagePart.image_url.url).toBe(`data:image/png;base64,${IMAGE.toString('base64')}`);
  });

  it('mezcla los parámetros extra del slot en el body', async () => {
    const calls = mockFetch([{ ok: true, text: 'ok' }]);
    await processImage(
      build({
        MEDIA_PROCESSING_API_KEY: 'sk',
        MEDIA_PROCESSING_OCR_EXTRA_PARAMS: '{"reasoning_effort":"none"}',
      }),
    );

    expect(bodyOf(calls[1]).reasoning_effort).toBe('none');
  });

  it('si el principal falla, entra el fallback con su propio proveedor, llave y parámetros', async () => {
    const calls = mockFetch([{ ok: false, status: 500 }, { ok: true, text: 'desde Claude' }]);
    const adapter = build({
      MEDIA_PROCESSING_API_KEY: 'sk-openai',
      MEDIA_PROCESSING_OCR_MODEL: 'gpt-6-luna',
      MEDIA_PROCESSING_OCR_FALLBACK_MODEL: 'claude-haiku-5-5',
      MEDIA_PROCESSING_OCR_FALLBACK_API_BASE_URL: 'https://api.anthropic.com/v1',
      MEDIA_PROCESSING_OCR_FALLBACK_API_KEY: 'sk-ant',
      MEDIA_PROCESSING_OCR_FALLBACK_EXTRA_PARAMS: '{"max_tokens":1024}',
    });

    const result = await processImage(adapter);

    expect(result).toMatchObject({
      status: 'PROCESSED',
      processedText: 'desde Claude',
      metadata: { model: 'claude-haiku-5-5', fallbackConfigured: true },
    });
    const fallback = calls[2];
    expect(fallback.url).toBe('https://api.anthropic.com/v1/chat/completions');
    expect(authOf(fallback)).toBe('Bearer sk-ant');
    expect(bodyOf(fallback)).toMatchObject({ model: 'claude-haiku-5-5', max_tokens: 1024 });
  });

  it('el fallback sin URL ni llave propias usa las del principal', async () => {
    const calls = mockFetch([{ ok: false }, { ok: true, text: 'ok' }]);
    await processImage(
      build({
        MEDIA_PROCESSING_OCR_API_BASE_URL: 'https://api.anthropic.com/v1',
        MEDIA_PROCESSING_OCR_API_KEY: 'sk-ant',
        MEDIA_PROCESSING_OCR_MODEL: 'claude-sonnet-5-5',
        MEDIA_PROCESSING_OCR_FALLBACK_MODEL: 'claude-haiku-5-5',
      }),
    );

    expect(calls[2].url).toBe('https://api.anthropic.com/v1/chat/completions');
    expect(authOf(calls[2])).toBe('Bearer sk-ant');
  });

  it('sin ninguna llave de OCR falla sin llamar a nadie', async () => {
    const calls = mockFetch([]);
    const result = await processImage(build({}));

    expect(result.status).toBe('FAILED');
    expect(calls).toHaveLength(0);
  });

  it('un JSON de parámetros inválido impide construir el adapter', () => {
    expect(() =>
      build({ MEDIA_PROCESSING_API_KEY: 'sk', MEDIA_PROCESSING_OCR_EXTRA_PARAMS: 'reasoning=none' }),
    ).toThrow(/MEDIA_PROCESSING_OCR_EXTRA_PARAMS/);
  });
});

describe('OpenAiCompatibleMediaProcessorAdapter — STT', () => {
  it('el default de transcripción es gpt-transcribe', async () => {
    const calls: string[] = [];
    jest.spyOn(global, 'fetch').mockImplementation((_input, init) => {
      calls.push((init?.body as FormData).get('model') as string);
      return Promise.resolve(new Response(JSON.stringify({ text: 'hola' }), { status: 200 }));
    });

    const result = await build({ MEDIA_PROCESSING_API_KEY: 'sk' }).transcribeBuffer({
      buffer: Buffer.from('audio'),
      mimeType: 'audio/ogg',
    });

    expect(result).toMatchObject({ status: 'PROCESSED', processedText: 'hola' });
    expect(calls).toEqual(['gpt-transcribe']);
  });
});
