import { WhatsappMessageQueueService } from '../whatsapp-config/whatsapp-message-queue.service';

/**
 * Marca de "turno en curso". Se prueba contra el REST de Upstash simulado: lo que importa
 * es qué comando sale y cómo se interpreta la respuesta, sobre todo cuando Redis falla.
 */
describe('ChannelMessageQueueService — turno por conversación', () => {
  const originalRedisUrl = process.env.REDIS_URL;
  const fetchMock = jest.fn();
  let service: WhatsappMessageQueueService;

  const upstashReply = (result: unknown) =>
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ result }) });

  const sentCommand = (call = 0) => JSON.parse(fetchMock.mock.calls[call][1].body);

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as any;
    process.env.REDIS_URL = 'rediss://default:token@example.upstash.io:6379';
    service = new WhatsappMessageQueueService();
  });

  afterAll(() => {
    process.env.REDIS_URL = originalRedisUrl;
  });

  it('toma el turno con SET NX y una caducidad propia', async () => {
    upstashReply('OK');

    const turn = await service.acquireTurn('org-1', '+521111111111', '+527821176985');

    expect(turn.acquired).toBe(true);
    expect(turn.token).toEqual(expect.any(String));
    const [cmd, key, token, nx, ex] = sentCommand();
    expect(cmd).toBe('SET');
    expect(key).toBe('wa:busy:org-1:+521111111111:+527821176985');
    expect(token).toBe(turn.token);
    expect([nx, ex]).toEqual(['NX', 'EX']);
  });

  it('no lo toma si ya existe la marca de otro turno', async () => {
    upstashReply(null);

    const turn = await service.acquireTurn('org-1', 'acc', 'sender');

    expect(turn).toEqual({ acquired: false, token: null });
  });

  it('si Redis falla sigue sin marca en vez de dejar al cliente sin respuesta', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));

    const turn = await service.acquireTurn('org-1', 'acc', 'sender');

    expect(turn).toEqual({ acquired: true, token: null });
  });

  it('suelta solo su propia marca, comparando el token dentro de Redis', async () => {
    upstashReply(1);

    await service.releaseTurn('org-1', 'acc', 'sender', 'tok-1');

    const [cmd, script, numKeys, key, token] = sentCommand();
    expect(cmd).toBe('EVAL');
    expect(script).toContain("redis.call('GET', KEYS[1]) == ARGV[1]");
    expect(numKeys).toBe('1');
    expect(key).toBe('wa:busy:org-1:acc:sender');
    expect(token).toBe('tok-1');
  });

  it('sin token no hay nada que soltar', async () => {
    await service.releaseTurn('org-1', 'acc', 'sender', null);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('soltar nunca lanza: si falla, la marca caduca sola', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));

    await expect(service.releaseTurn('org-1', 'acc', 'sender', 'tok-1')).resolves.toBeUndefined();
  });
});
