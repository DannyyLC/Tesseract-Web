import * as crypto from 'crypto';
import { MetaPayloadConsumer } from './meta.payload-consumer';
import { EBMessageType, WBEventTypes } from './wb-payload-consumer.interface';
import { WBPayloadConsumerResolver } from './wb-payload-consumer.resolver';
import { YCloudPayloadConsumer } from './ycloud.payload-consumer';

describe('WhatsApp payload consumers', () => {
  const mockLogger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() } as any;

  beforeEach(() => jest.clearAllMocks());

  describe('verifySignature', () => {
    const payload = '{"entry":[{"id":"1"}]}';
    const hmac = (secret: string, data: string) =>
      crypto.createHmac('sha256', secret).update(data).digest('hex');
    const original = {
      meta: process.env.META_WHATSAPP_APP_SECRET,
      ycloud: process.env.Y_CLOUD_WEBHOOK_SECRET,
    };

    beforeAll(() => {
      process.env.META_WHATSAPP_APP_SECRET = 'meta-secret';
      process.env.Y_CLOUD_WEBHOOK_SECRET = 'ycloud-secret';
    });
    afterAll(() => {
      process.env.META_WHATSAPP_APP_SECRET = original.meta;
      process.env.Y_CLOUD_WEBHOOK_SECRET = original.ycloud;
    });

    describe('MetaPayloadConsumer', () => {
      const consumer = new MetaPayloadConsumer({ object: 'whatsapp_business_account' }, mockLogger);

      it('acepta una firma válida sin importar el casing del header', async () => {
        const headers = { 'X-Hub-Signature-256': `sha256=${hmac('meta-secret', payload)}` };
        await expect(consumer.verifySignature(payload, headers)).resolves.toBe(true);
      });

      it('rechaza firma incorrecta, ausente o malformada', async () => {
        await expect(
          consumer.verifySignature(payload, { 'x-hub-signature-256': `sha256=${hmac('otro', payload)}` }),
        ).resolves.toBe(false);
        await expect(consumer.verifySignature(payload, {})).resolves.toBe(false);
        await expect(
          consumer.verifySignature(payload, { 'x-hub-signature-256': 'basura' }),
        ).resolves.toBe(false);
      });

      it('rechaza si el payload fue alterado', async () => {
        const headers = { 'x-hub-signature-256': `sha256=${hmac('meta-secret', payload)}` };
        await expect(consumer.verifySignature(payload + ' ', headers)).resolves.toBe(false);
      });
    });

    describe('YCloudPayloadConsumer', () => {
      const consumer = new YCloudPayloadConsumer({} as any, mockLogger);
      const signed = (timestamp: number, key = 's') =>
        `t=${timestamp},${key}=${hmac('ycloud-secret', `${timestamp}.${payload}`)}`;
      const now = () => Math.floor(Date.now() / 1000);

      it('acepta una firma válida con s o v1', async () => {
        await expect(
          consumer.verifySignature(payload, { 'ycloud-signature': signed(now()) }),
        ).resolves.toBe(true);
        await expect(
          consumer.verifySignature(payload, { 'ycloud-signature': signed(now(), 'v1') }),
        ).resolves.toBe(true);
      });

      it('rechaza firma incorrecta, ausente o malformada', async () => {
        await expect(
          consumer.verifySignature(payload, { 'ycloud-signature': `t=${now()},s=invalida` }),
        ).resolves.toBe(false);
        await expect(consumer.verifySignature(payload, {})).resolves.toBe(false);
        await expect(
          consumer.verifySignature(payload, { 'ycloud-signature': 'basura' }),
        ).resolves.toBe(false);
      });

      it('rechaza una firma fuera de la ventana de tolerancia', async () => {
        await expect(
          consumer.verifySignature(payload, { 'ycloud-signature': signed(now() - 3600) }),
        ).resolves.toBe(false);
      });
    });
  });

  describe('MetaPayloadConsumer', () => {
    const consume = (payload: object) => new MetaPayloadConsumer(payload as any, mockLogger);
    const payloadOf = (field: string, valueExtras: object) => ({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba-1',
          changes: [
            {
              field,
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '+52 55 1111 1111', phone_number_id: '123' },
                ...valueExtras,
              },
            },
          ],
        },
      ],
    });
    const received = payloadOf('messages', {
      messages: [{ id: 'wamid.A', from: '5255222222', timestamp: '1700000000', type: 'image' }],
    });
    const echo = payloadOf('smb_message_echoes', {
      message_echoes: [
        { id: 'wamid.B', from: '525511111111', to: '5255222222', timestamp: '1700000000', type: 'text' },
      ],
    });

    it('lee un mensaje entrante', () => {
      expect(consume(received).getWBEventType()).toBe(WBEventTypes.MsgReceived);
      expect(consume(received).getFromNumber()).toBe('5255222222');
      expect(consume(received).getToNumber()).toBe('525511111111');
      expect(consume(received).getWhatsappMessageId()).toBe('wamid.A');
      expect(consume(received).getSendTime()).toBe('2023-11-14T22:13:20.000Z');
      expect(consume(received).getMessageType()).toBe(EBMessageType.Image);
    });

    it('lee un echo: from es el negocio y to el cliente', () => {
      expect(consume(echo).getWBEventType()).toBe(WBEventTypes.MsgEchoes);
      expect(consume(echo).getFromNumber()).toBe('525511111111');
      expect(consume(echo).getToNumber()).toBe('5255222222');
      expect(consume(echo).getWhatsappMessageId()).toBe('wamid.B');
    });

    it('marca NotAllowed lo que no es un mensaje entrante ni un echo', () => {
      expect(consume({}).getWBEventType()).toBe(WBEventTypes.NotAllowed);
      expect(consume({ ...received, object: 'page' }).getWBEventType()).toBe(WBEventTypes.NotAllowed);
      expect(consume(payloadOf('account_update', { messages: [{ id: 'x' }] })).getWBEventType()).toBe(
        WBEventTypes.NotAllowed,
      );
      // El campo dice echo pero no trae `message_echoes`.
      expect(consume(payloadOf('smb_message_echoes', {})).getWBEventType()).toBe(WBEventTypes.NotAllowed);
    });

    it('no revienta con un payload sin mensajes (p. ej. un acuse)', () => {
      const status = payloadOf('messages', { statuses: [{ id: 'x' }] });
      expect(consume(status).getWBEventType()).toBe(WBEventTypes.NotAllowed);
      expect(consume(status).getWhatsappMessageId()).toBe('');
      expect(consume({}).getFromNumber()).toBe('');
      expect(consume({}).getMessageType()).toBe(EBMessageType.Text);
    });
  });

  describe('YCloudPayloadConsumer', () => {
    const consume = (payload: object) => new YCloudPayloadConsumer(payload as any, mockLogger);
    const received = {
      id: 'evt-1',
      type: 'whatsapp.inbound_message.received',
      whatsappInboundMessage: {
        id: 'ycloud-id',
        wamid: 'wamid.A',
        from: '+5255222222',
        to: '+525511111111',
        sendTime: '2023-11-14T22:13:20.000Z',
        type: 'audio',
      },
    };
    const echo = {
      id: 'evt-2',
      type: 'whatsapp.smb.message.echoes',
      whatsappMessage: { id: 'ycloud-id-2', from: '+525511111111', to: '+5255222222', type: 'text' },
    };

    it('lee un mensaje entrante', () => {
      expect(consume(received).getWBEventType()).toBe(WBEventTypes.MsgReceived);
      expect(consume(received).getFromNumber()).toBe('+5255222222');
      expect(consume(received).getToNumber()).toBe('+525511111111');
      expect(consume(received).getWhatsappMessageId()).toBe('wamid.A');
      expect(consume(received).getSendTime()).toBe('2023-11-14T22:13:20.000Z');
      expect(consume(received).getMessageType()).toBe(EBMessageType.Audio);
    });

    it('marca NotAllowed cualquier evento que no sea entrante ni echo', () => {
      expect(consume({ type: 'whatsapp.message.updated' }).getWBEventType()).toBe(WBEventTypes.NotAllowed);
      expect(consume({}).getWBEventType()).toBe(WBEventTypes.NotAllowed);
    });

    it('lee un echo desde whatsappMessage y cae al id de YCloud sin wamid', () => {
      expect(consume(echo).getWBEventType()).toBe(WBEventTypes.MsgEchoes);
      expect(consume(echo).getFromNumber()).toBe('+525511111111');
      expect(consume(echo).getToNumber()).toBe('+5255222222');
      expect(consume(echo).getWhatsappMessageId()).toBe('ycloud-id-2');
      expect(consume(echo).getMessageType()).toBe(EBMessageType.Text);
    });
  });

  describe('getInterpretedMessage', () => {
    const policy: any = {
      image: { enabled: true },
      audio: { enabled: true, maxSeconds: 120 },
      messages: {
        imageDisabled: 'imagen apagada',
        audioDisabled: 'audio apagado',
        audioTooLong: 'audio muy largo',
        audioFailed: 'no pude escuchar el audio',
        videoDisabled: 'video no soportado',
        unsupportedFormat: 'formato no soportado',
      },
    };
    const mediaProcessing = { processIncomingAttachments: jest.fn() };
    const context = (overrides: object = {}): any => ({
      organizationId: 'org-1',
      policy,
      logContext: {},
      mediaProcessing,
      sessionData: { accessToken: 'tok' },
      ...overrides,
    });
    const ycloud = (message: object) =>
      new YCloudPayloadConsumer(
        { type: 'whatsapp.inbound_message.received', whatsappInboundMessage: { id: 'm', ...message } } as any,
        mockLogger,
      );
    const meta = (message: object) =>
      new MetaPayloadConsumer(
        {
          object: 'whatsapp_business_account',
          entry: [{ id: 'w', changes: [{ field: 'messages', value: { messages: [{ id: 'm', ...message }] } }] }],
        } as any,
        mockLogger,
      );
    const transcribed = { processedText: 'hola desde audio', type: 'AUDIO' };

    it('devuelve el texto de un mensaje de texto', async () => {
      expect(await ycloud({ type: 'text', text: { body: 'hola' } }).getInterpretedMessage(context())).toEqual({
        text: 'hola',
      });
      expect(await meta({ type: 'text', text: { body: 'hola' } }).getInterpretedMessage(context())).toEqual({
        text: 'hola',
      });
    });

    it('usa el pie de la imagen, o avisa si la política la apagó', async () => {
      const image = { type: 'image', image: { caption: 'mira' } };
      expect((await ycloud(image).getInterpretedMessage(context())).text).toBe('mira');
      const off = await meta(image).getInterpretedMessage(context({ policy: { ...policy, image: { enabled: false } } }));
      expect(off).toEqual({ notice: 'imagen apagada' });
    });

    it('avisa de video, formatos no soportados y política de audio apagada', async () => {
      expect((await ycloud({ type: 'video' }).getInterpretedMessage(context())).notice).toBe('video no soportado');
      expect((await meta({ type: 'sticker' }).getInterpretedMessage(context())).notice).toBe('formato no soportado');
      const off = await ycloud({ type: 'audio' }).getInterpretedMessage(
        context({ policy: { ...policy, audio: { enabled: false } } }),
      );
      expect(off.notice).toBe('audio apagado');
      expect(mediaProcessing.processIncomingAttachments).not.toHaveBeenCalled();
    });

    it('no interpreta ni avisa un evento NotAllowed', async () => {
      const status = new MetaPayloadConsumer(
        { object: 'whatsapp_business_account', entry: [{ id: 'w', changes: [{ field: 'messages', value: { statuses: [] } }] }] } as any,
        mockLogger,
      );
      expect(await status.getInterpretedMessage(context())).toEqual({});
    });

    it('YCloud transcribe el audio desde el link, sin headers', async () => {
      mediaProcessing.processIncomingAttachments.mockResolvedValue({ attachments: [transcribed] });
      const result = await ycloud({
        type: 'audio',
        audio: { link: 'https://y.cloud/a.ogg', mime_type: 'audio/ogg', sha256: 'abc' },
      }).getInterpretedMessage(context());

      expect(mediaProcessing.processIncomingAttachments).toHaveBeenCalledWith('org-1', [
        expect.objectContaining({
          type: 'AUDIO',
          sourceUrl: 'https://y.cloud/a.ogg',
          sha256: 'abc',
          sourceHeaders: undefined,
          maxBytes: expect.any(Number),
        }),
      ]);
      expect(result).toEqual({ text: 'hola desde audio', attachment: transcribed });
    });

    it('Meta resuelve el id contra la Graph API y baja el audio con el token', async () => {
      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ url: 'https://lookaside.fb/a', mime_type: 'audio/ogg; codecs=opus', sha256: 'h' }),
      } as any);
      mediaProcessing.processIncomingAttachments.mockResolvedValue({ attachments: [transcribed] });

      const result = await meta({ type: 'audio', audio: { id: 'media-1', sha256: 'abc' } }).getInterpretedMessage(
        context(),
      );

      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/media-1'), {
        headers: { Authorization: 'Bearer tok' },
      });
      expect(mediaProcessing.processIncomingAttachments).toHaveBeenCalledWith('org-1', [
        expect.objectContaining({
          sourceUrl: 'https://lookaside.fb/a',
          mimeType: 'audio/ogg; codecs=opus',
          sha256: 'abc',
          sourceHeaders: { Authorization: 'Bearer tok' },
        }),
      ]);
      expect(result.text).toBe('hola desde audio');
      fetchMock.mockRestore();
    });

    it('Meta avisa si no hay token o la Graph API falla, sin reventar', async () => {
      const noToken = await meta({ type: 'audio', audio: { id: 'media-1' } }).getInterpretedMessage(
        context({ sessionData: {} }),
      );
      expect(noToken.notice).toBe('no pude escuchar el audio');
      expect(noToken.mediaError).toContain('accessToken');

      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 400 } as any);
      const failed = await meta({ type: 'audio', audio: { id: 'media-1' } }).getInterpretedMessage(context());
      expect(failed).toEqual({ notice: 'no pude escuchar el audio', mediaError: expect.stringContaining('400') });
      fetchMock.mockRestore();
    });

    it('avisa cuando el audio excede el límite o no se pudo transcribir', async () => {
      mediaProcessing.processIncomingAttachments.mockResolvedValueOnce({
        attachments: [{ tooLarge: true, sizeBytes: 9_000_000 }],
      });
      const audio = { type: 'audio', audio: { link: 'https://y.cloud/a.ogg' } };
      expect((await ycloud(audio).getInterpretedMessage(context())).notice).toBe('audio muy largo');

      mediaProcessing.processIncomingAttachments.mockResolvedValueOnce({
        attachments: [{ processingError: 'boom' }],
      });
      expect(await ycloud(audio).getInterpretedMessage(context())).toEqual({
        notice: 'no pude escuchar el audio',
        mediaError: 'boom',
      });
    });
  });

  describe('WBPayloadConsumerResolver', () => {
    const resolver = new WBPayloadConsumerResolver(mockLogger);

    it('crea el consumer del proveedor, ligado al payload recibido', () => {
      const ycloudEvent = { type: 'whatsapp.smb.message.echoes' };
      expect(resolver.forProvider('ycloud', ycloudEvent)).toBeInstanceOf(YCloudPayloadConsumer);
      expect(resolver.forProvider('ycloud', ycloudEvent).getWBEventType()).toBe(WBEventTypes.MsgEchoes);
      expect(resolver.forProvider('meta', {})).toBeInstanceOf(MetaPayloadConsumer);
    });

    it('no comparte estado entre payloads: cada llamada es una instancia nueva', () => {
      const echo = resolver.forProvider('ycloud', { type: 'whatsapp.smb.message.echoes' });
      const received = resolver.forProvider('ycloud', { type: 'whatsapp.inbound_message.received' });
      expect(echo.getWBEventType()).toBe(WBEventTypes.MsgEchoes);
      expect(received.getWBEventType()).toBe(WBEventTypes.MsgReceived);
    });

    it('rechaza proveedores desconocidos, incluidas claves heredadas del prototipo', () => {
      expect(() => resolver.forProvider('twilio', {})).toThrow('twilio');
      expect(() => resolver.forProvider('toString', {})).toThrow('toString');
    });
  });
});
