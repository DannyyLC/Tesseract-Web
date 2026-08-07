import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/platform/database/prisma.service';
import { MediaProcessingService } from './media-processing.service';
import { MEDIA_PROCESSOR_ADAPTER } from './adapters/media-processor.adapter';
import { DEFAULT_MEDIA_POLICY, MediaPolicy, maxAudioBytes } from './media-policy';

describe('MediaProcessingService.transcribeDictation', () => {
  let service: MediaProcessingService;

  const mockAdapter = {
    process: jest.fn(),
    transcribeBuffer: jest.fn(),
  };

  const mockPrismaService = {
    messageAttachment: { findFirst: jest.fn() },
  };

  /** Política con el audio encendido; los defaults lo traen apagado a propósito. */
  const enabledPolicy = (overrides: Partial<MediaPolicy['audio']> = {}): MediaPolicy => ({
    ...DEFAULT_MEDIA_POLICY,
    audio: { enabled: true, maxSeconds: 300, ...overrides },
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaProcessingService,
        { provide: MEDIA_PROCESSOR_ADAPTER, useValue: mockAdapter },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get(MediaProcessingService);
    jest.clearAllMocks();
  });

  it('devuelve la transcripción cuando el audio está habilitado', async () => {
    mockAdapter.transcribeBuffer.mockResolvedValue({
      status: 'PROCESSED',
      processedText: '  Hola, necesito ayuda con mi pedido.  ',
      processor: 'x',
      processorVersion: '1',
    });

    const result = await service.transcribeDictation({
      buffer: Buffer.from('audio-falso'),
      mimeType: 'audio/webm',
      policy: enabledPolicy(),
    });

    expect(result).toEqual({ status: 'PROCESSED', text: 'Hola, necesito ayuda con mi pedido.' });
    expect(mockAdapter.transcribeBuffer).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'audio/webm', metadata: { source: 'web-dictation' } }),
    );
  });

  it('rechaza sin llamar al proveedor si el workflow no tiene audio contratado', async () => {
    const result = await service.transcribeDictation({
      buffer: Buffer.from('audio-falso'),
      mimeType: 'audio/webm',
      policy: DEFAULT_MEDIA_POLICY, // audio.enabled = false
    });

    expect(result).toEqual({
      status: 'REJECTED',
      reason: 'AUDIO_DISABLED',
      message: DEFAULT_MEDIA_POLICY.messages.audioDisabled,
    });
    // Lo importante: no se paga una transcripción que el cliente no contrató
    expect(mockAdapter.transcribeBuffer).not.toHaveBeenCalled();
  });

  it('rechaza un audio que excede el límite de duración de la política', async () => {
    const policy = enabledPolicy({ maxSeconds: 10 });
    const tooBig = Buffer.alloc(maxAudioBytes(policy) + 1);

    const result = await service.transcribeDictation({
      buffer: tooBig,
      mimeType: 'audio/webm',
      policy,
    });

    expect(result).toEqual({
      status: 'REJECTED',
      reason: 'AUDIO_TOO_LONG',
      message: policy.messages.audioTooLong,
    });
    expect(mockAdapter.transcribeBuffer).not.toHaveBeenCalled();
  });

  it('acepta un audio justo en el límite', async () => {
    const policy = enabledPolicy({ maxSeconds: 10 });
    mockAdapter.transcribeBuffer.mockResolvedValue({
      status: 'PROCESSED',
      processedText: 'ok',
      processor: 'x',
      processorVersion: '1',
    });

    const result = await service.transcribeDictation({
      buffer: Buffer.alloc(maxAudioBytes(policy)),
      mimeType: 'audio/webm',
      policy,
    });

    expect(result.status).toBe('PROCESSED');
  });

  it('rechaza un cuerpo vacío sin llamar al proveedor', async () => {
    const result = await service.transcribeDictation({
      buffer: Buffer.alloc(0),
      mimeType: 'audio/webm',
      policy: enabledPolicy(),
    });

    expect(result).toMatchObject({ status: 'REJECTED', reason: 'EMPTY_AUDIO' });
    expect(mockAdapter.transcribeBuffer).not.toHaveBeenCalled();
  });

  it('trata como fallo una transcripción vacía del proveedor', async () => {
    mockAdapter.transcribeBuffer.mockResolvedValue({
      status: 'PROCESSED',
      processedText: '   ',
      processor: 'x',
      processorVersion: '1',
    });

    const result = await service.transcribeDictation({
      buffer: Buffer.from('audio-falso'),
      mimeType: 'audio/webm',
      policy: enabledPolicy(),
    });

    // Devolver una cadena en blanco al composer sería peor que decir que falló
    expect(result).toEqual({
      status: 'FAILED',
      message: DEFAULT_MEDIA_POLICY.messages.audioFailed,
    });
  });

  it('propaga el mensaje de la política cuando el proveedor falla', async () => {
    mockAdapter.transcribeBuffer.mockResolvedValue({
      status: 'FAILED',
      error: 'timeout',
      processor: 'x',
      processorVersion: '1',
    });

    const policy = enabledPolicy();
    policy.messages = { ...policy.messages, audioFailed: 'Mensaje propio del cliente' };

    const result = await service.transcribeDictation({
      buffer: Buffer.from('audio-falso'),
      mimeType: 'audio/webm',
      policy,
    });

    expect(result).toEqual({ status: 'FAILED', message: 'Mensaje propio del cliente' });
  });
});
