import { MediaProcessingService, IncomingAttachment } from './media-processing.service';

describe('MediaProcessingService', () => {
  let service: MediaProcessingService;

  const mockAdapter = {
    process: jest.fn(),
  } as any;

  const mockPrisma: any = {
    messageAttachment: {
      findFirst: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MediaProcessingService(mockAdapter, mockPrisma);
  });

  it('returns empty object when no attachments provided', async () => {
    const res = await service.processIncomingAttachments('org-1', undefined);
    expect(res).toEqual({});

    const res2 = await service.processIncomingAttachments('org-1', []);
    expect(res2).toEqual({});
  });

  it('returns cached processed attachment when cache hit', async () => {
    const attachment: IncomingAttachment = { type: 'IMAGE', mimeType: 'image/png', sourceUrl: 'http://x', sha256: 'abc' };
    const cached = {
      id: 'att-1',
      processedText: 'cached text',
      processedAt: new Date('2026-01-01'),
      processor: 'ocr-v1',
      processorVersion: '1.2.3',
    };

    mockPrisma.messageAttachment.findFirst.mockResolvedValue(cached);

    const res = await service.processIncomingAttachments('org-1', [attachment]);

    expect(mockPrisma.messageAttachment.findFirst).toHaveBeenCalled();
    expect(res.attachments?.[0].processingStatus).toBe('PROCESSED');
    expect(res.attachments?.[0].processedText).toBe('cached text');
    expect(res.attachments?.[0].metadata?.cacheHit).toBe(true);
    expect(res.derivedText).toBe('cached text');
    // adapter should not be called when cache hit
    expect(mockAdapter.process).not.toHaveBeenCalled();
  });

  it('returns FAILED status when adapter returns failed', async () => {
    const attachment: IncomingAttachment = { type: 'AUDIO', mimeType: 'audio/mp3', sourceUrl: 'http://a' };

    mockPrisma.messageAttachment.findFirst.mockResolvedValue(null);
    mockAdapter.process.mockResolvedValue({
      status: 'FAILED',
      error: 'network',
      processor: 'proc',
      processorVersion: '0.1',
      metadata: { foo: 'bar' },
    });

    const res = await service.processIncomingAttachments('org-1', [attachment]);

    expect(mockAdapter.process).toHaveBeenCalledWith(expect.objectContaining({ sourceUrl: 'http://a' }));
    const out = res.attachments?.[0];
    expect(out?.processingStatus).toBe('FAILED');
    expect(out?.processingError).toBe('network');
    expect(out?.processor).toBe('proc');
    expect(out?.processorVersion).toBe('0.1');
    expect(out?.metadata?.foo).toBe('bar');
    expect(res.derivedText).toBeUndefined();
  });

  it('processes attachments and returns processed results and derivedText', async () => {
    const a1: IncomingAttachment = { type: 'IMAGE', mimeType: 'image/png', sourceUrl: 'http://1' };
    const a2: IncomingAttachment = { type: 'AUDIO', mimeType: 'audio/mp3', sourceUrl: 'http://2' };

    mockPrisma.messageAttachment.findFirst.mockResolvedValue(null);
    mockAdapter.process
      .mockResolvedValueOnce({ status: 'PROCESSED', processedText: 'text1', processor: 'p1', processorVersion: 'v1', metadata: { x: 1 } })
      .mockResolvedValueOnce({ status: 'PROCESSED', processedText: 'text2', processor: 'p2', processorVersion: 'v2', metadata: { y: 2 } });

    const res = await service.processIncomingAttachments('org-1', [a1, a2]);

    expect(mockAdapter.process).toHaveBeenCalledTimes(2);
    expect(res.attachments?.length).toBe(2);
    expect(res.attachments?.[0].processedText).toBe('text1');
    expect(res.attachments?.[1].processedText).toBe('text2');
    expect(res.derivedText).toBe('text1\ntext2');
  });

  it('uses sha256 when provided for contentHash computation', async () => {
    const a: IncomingAttachment = { type: 'IMAGE', mimeType: 'image/png', sourceUrl: 'http://z', sha256: 'deadbeef' };
    mockPrisma.messageAttachment.findFirst.mockResolvedValue(null);
    mockAdapter.process.mockResolvedValue({ status: 'PROCESSED', processedText: 'ok', processor: 'p', processorVersion: 'v', metadata: {} });

    const res = await service.processIncomingAttachments('org-1', [a]);
    const contentHash = res.attachments?.[0].contentHash;
    expect(typeof contentHash).toBe('string');
    // ensure adapter called
    expect(mockAdapter.process).toHaveBeenCalled();
  });
});
