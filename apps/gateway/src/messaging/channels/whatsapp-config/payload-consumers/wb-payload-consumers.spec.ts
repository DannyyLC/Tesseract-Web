import * as crypto from 'crypto';
import { MetaPayloadConsumer } from './meta.payload-consumer';
import { EBMessageType, WBEventTypes } from './wb-payload-consumer.interface';
import { WBPayloadConsumerResolver } from './wb-payload-consumer.resolver';
import { YCloudPayloadConsumer } from './ycloud.payload-consumer';

describe('WhatsApp payload consumers', () => {
  const mockLogger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() } as any;

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

  // La cuenta del número del negocio: el consumer la resuelve en `initAsyncProcesses` y de
  // ahí saca la organización, el workflow (para la política) y las credenciales de Meta.
  const account: any = {
    id: 'cfg-1',
    organizationId: 'org-1',
    phoneNumber: '+525511111111',
    defaultWorkflowId: 'wf-1',
    sessionData: { phoneNumberId: '123', appSecret: 'kms:v1:x', accessToken: 'kms:v1:y' },
  };

  const mediaProcessing = { processIncomingAttachments: jest.fn() };
  const workflows = { getChannelPolicy: jest.fn() };
  const whatsappConfig = { getWhatsappConfigByPhoneNumber: jest.fn(), decryptSessionData: jest.fn() };

  /** Un consumer listo para usarse, como lo deja el resolver (con su cuenta ya resuelta). */
  const build = async <T extends YCloudPayloadConsumer | MetaPayloadConsumer>(
    Consumer: new (...args: any[]) => T,
    payload: object,
  ): Promise<T> => {
    const consumer = new Consumer(
      payload,
      mockLogger,
      mediaProcessing,
      workflows,
      whatsappConfig,
    );
    await consumer.initAsyncProcesses();
    return consumer;
  };

  beforeEach(() => {
    jest.resetAllMocks();
    whatsappConfig.getWhatsappConfigByPhoneNumber.mockResolvedValue(account);
    whatsappConfig.decryptSessionData.mockResolvedValue({
      phoneNumberId: '123',
      appSecret: 'meta-secret',
      accessToken: 'tok',
    });
    workflows.getChannelPolicy.mockResolvedValue({ mediaPolicy: policy, presenceIndicators: true });
  });

  describe('verifySignature', () => {
    const payload = '{"entry":[{"id":"1"}]}';
    const hmac = (secret: string, data: string) =>
      crypto.createHmac('sha256', secret).update(data).digest('hex');
    const metaWebhook = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'w',
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { display_phone_number: '525511111111' },
                messages: [{ id: 'm', from: '5255222222', type: 'text' }],
              },
            },
          ],
        },
      ],
    };

    describe('MetaPayloadConsumer', () => {
      it('acepta una firma válida (con el appSecret de la cuenta) sin importar el casing del header', async () => {
        const consumer = await build(MetaPayloadConsumer, metaWebhook);
        const headers = { 'X-Hub-Signature-256': `sha256=${hmac('meta-secret', payload)}` };

        await expect(consumer.verifySignature(payload, headers)).resolves.toBe(true);
        expect(whatsappConfig.getWhatsappConfigByPhoneNumber).toHaveBeenCalledWith('+525511111111');
        expect(whatsappConfig.decryptSessionData).toHaveBeenCalledWith(account);
      });

      it('rechaza firma incorrecta, ausente o malformada', async () => {
        const consumer = await build(MetaPayloadConsumer, metaWebhook);
        await expect(
          consumer.verifySignature(payload, { 'x-hub-signature-256': `sha256=${hmac('otro', payload)}` }),
        ).resolves.toBe(false);
        await expect(consumer.verifySignature(payload, {})).resolves.toBe(false);
        await expect(
          consumer.verifySignature(payload, { 'x-hub-signature-256': 'basura' }),
        ).resolves.toBe(false);
      });

      it('rechaza si el payload fue alterado', async () => {
        const consumer = await build(MetaPayloadConsumer, metaWebhook);
        const headers = { 'x-hub-signature-256': `sha256=${hmac('meta-secret', payload)}` };
        await expect(consumer.verifySignature(payload + ' ', headers)).resolves.toBe(false);
      });

      it('rechaza si el número no tiene cuenta o la cuenta no tiene appSecret (p. ej. es de YCloud)', async () => {
        const headers = { 'x-hub-signature-256': `sha256=${hmac('meta-secret', payload)}` };

        whatsappConfig.getWhatsappConfigByPhoneNumber.mockResolvedValueOnce(null);
        const unknown = await build(MetaPayloadConsumer, metaWebhook);
        await expect(unknown.verifySignature(payload, headers)).resolves.toBe(false);

        whatsappConfig.decryptSessionData.mockResolvedValueOnce(null);
        const noSecret = await build(MetaPayloadConsumer, metaWebhook);
        await expect(noSecret.verifySignature(payload, headers)).resolves.toBe(false);
      });
    });

    describe('YCloudPayloadConsumer', () => {
      const original = process.env.Y_CLOUD_WEBHOOK_SECRET;
      beforeAll(() => {
        process.env.Y_CLOUD_WEBHOOK_SECRET = 'ycloud-secret';
      });
      afterAll(() => {
        process.env.Y_CLOUD_WEBHOOK_SECRET = original;
      });

      const signed = (timestamp: number, key = 's') =>
        `t=${timestamp},${key}=${hmac('ycloud-secret', `${timestamp}.${payload}`)}`;
      const now = () => Math.floor(Date.now() / 1000);

      it('acepta una firma válida con s o v1', async () => {
        const consumer = await build(YCloudPayloadConsumer, {});
        await expect(
          consumer.verifySignature(payload, { 'ycloud-signature': signed(now()) }),
        ).resolves.toBe(true);
        await expect(
          consumer.verifySignature(payload, { 'ycloud-signature': signed(now(), 'v1') }),
        ).resolves.toBe(true);
      });

      it('rechaza firma incorrecta, ausente o malformada', async () => {
        const consumer = await build(YCloudPayloadConsumer, {});
        await expect(
          consumer.verifySignature(payload, { 'ycloud-signature': `t=${now()},s=invalida` }),
        ).resolves.toBe(false);
        await expect(consumer.verifySignature(payload, {})).resolves.toBe(false);
        await expect(
          consumer.verifySignature(payload, { 'ycloud-signature': 'basura' }),
        ).resolves.toBe(false);
      });

      it('rechaza una firma fuera de la ventana de tolerancia', async () => {
        const consumer = await build(YCloudPayloadConsumer, {});
        await expect(
          consumer.verifySignature(payload, { 'ycloud-signature': signed(now() - 3600) }),
        ).resolves.toBe(false);
      });
    });
  });

  describe('MetaPayloadConsumer', () => {
    const consume = (payload: object) => build(MetaPayloadConsumer, payload);
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

    it('lee un mensaje entrante, con los números en E.164', async () => {
      const consumer = await consume(received);
      expect(consumer.getWBEventType()).toBe(WBEventTypes.MsgReceived);
      expect(consumer.getFromNumber()).toBe('+5255222222');
      expect(consumer.getToNumber()).toBe('+525511111111');
      expect(consumer.getWhatsappMessageId()).toBe('wamid.A');
      expect(consumer.getSendTime()).toBe('2023-11-14T22:13:20.000Z');
      expect(consumer.getMessageType()).toBe(EBMessageType.Image);
    });

    it('lee un echo: from es el negocio y to el cliente', async () => {
      const consumer = await consume(echo);
      expect(consumer.getWBEventType()).toBe(WBEventTypes.MsgEchoes);
      expect(consumer.getFromNumber()).toBe('+525511111111');
      expect(consumer.getToNumber()).toBe('+5255222222');
      expect(consumer.getWhatsappMessageId()).toBe('wamid.B');
    });

    it('quita el 1 de móvil que Meta antepone a los números de México', async () => {
      const consumer = await consume(
        payloadOf('messages', { messages: [{ id: 'm', from: '5214493973847', type: 'text' }] }),
      );
      expect(consumer.getFromNumber()).toBe('+524493973847');
    });

    it('marca NotAllowed lo que no es un mensaje entrante ni un echo', async () => {
      expect((await consume({})).getWBEventType()).toBe(WBEventTypes.NotAllowed);
      expect((await consume({ ...received, object: 'page' })).getWBEventType()).toBe(
        WBEventTypes.NotAllowed,
      );
      expect(
        (await consume(payloadOf('account_update', { messages: [{ id: 'x' }] }))).getWBEventType(),
      ).toBe(WBEventTypes.NotAllowed);
      // El campo dice echo pero no trae `message_echoes`.
      expect((await consume(payloadOf('smb_message_echoes', {}))).getWBEventType()).toBe(
        WBEventTypes.NotAllowed,
      );
    });

    it('no revienta con un payload sin mensajes (p. ej. un acuse)', async () => {
      const status = await consume(payloadOf('messages', { statuses: [{ id: 'x' }] }));
      expect(status.getWBEventType()).toBe(WBEventTypes.NotAllowed);
      expect(status.getWhatsappMessageId()).toBe('');
      const empty = await consume({});
      expect(empty.getFromNumber()).toBe('');
      expect(empty.getMessageType()).toBe(EBMessageType.Text);
    });
  });

  describe('YCloudPayloadConsumer', () => {
    const consume = (payload: object) => build(YCloudPayloadConsumer, payload);
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

    it('lee un mensaje entrante y resuelve la cuenta por el número del negocio (to)', async () => {
      const consumer = await consume(received);
      expect(whatsappConfig.getWhatsappConfigByPhoneNumber).toHaveBeenCalledWith('+525511111111');
      expect(consumer.getWBEventType()).toBe(WBEventTypes.MsgReceived);
      expect(consumer.getFromNumber()).toBe('+5255222222');
      expect(consumer.getToNumber()).toBe('+525511111111');
      expect(consumer.getWhatsappMessageId()).toBe('wamid.A');
      expect(consumer.getSendTime()).toBe('2023-11-14T22:13:20.000Z');
      expect(consumer.getMessageType()).toBe(EBMessageType.Audio);
    });

    it('marca NotAllowed cualquier evento que no sea entrante ni echo', async () => {
      expect((await consume({ type: 'whatsapp.message.updated' })).getWBEventType()).toBe(
        WBEventTypes.NotAllowed,
      );
      expect((await consume({})).getWBEventType()).toBe(WBEventTypes.NotAllowed);
    });

    it('lee un echo desde whatsappMessage, resuelve la cuenta por from y cae al id de YCloud sin wamid', async () => {
      const consumer = await consume(echo);
      expect(whatsappConfig.getWhatsappConfigByPhoneNumber).toHaveBeenCalledWith('+525511111111');
      expect(consumer.getWBEventType()).toBe(WBEventTypes.MsgEchoes);
      expect(consumer.getFromNumber()).toBe('+525511111111');
      expect(consumer.getToNumber()).toBe('+5255222222');
      expect(consumer.getWhatsappMessageId()).toBe('ycloud-id-2');
      expect(consumer.getMessageType()).toBe(EBMessageType.Text);
    });
  });

  describe('getInterpretedMessage', () => {
    const ycloud = (message: object) =>
      build(YCloudPayloadConsumer, {
        type: 'whatsapp.inbound_message.received',
        whatsappInboundMessage: { id: 'm', to: '+525511111111', ...message },
      });
    const meta = (message: object) =>
      build(MetaPayloadConsumer, {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'w',
            changes: [
              {
                field: 'messages',
                value: {
                  metadata: { display_phone_number: '525511111111' },
                  messages: [{ id: 'm', ...message }],
                },
              },
            ],
          },
        ],
      });
    const withPolicy = (overrides: object) =>
      workflows.getChannelPolicy.mockResolvedValue({ mediaPolicy: { ...policy, ...overrides } });
    const transcribed = { processedText: 'hola desde audio', type: 'AUDIO' };

    it('devuelve el texto de un mensaje de texto', async () => {
      expect(await (await ycloud({ type: 'text', text: { body: 'hola' } })).getInterpretedMessage()).toEqual({
        text: 'hola',
      });
      expect(await (await meta({ type: 'text', text: { body: 'hola' } })).getInterpretedMessage()).toEqual({
        text: 'hola',
      });
    });

    it('toma la política del workflow por defecto de la cuenta', async () => {
      await (await ycloud({ type: 'text', text: { body: 'hola' } })).getInterpretedMessage();
      expect(workflows.getChannelPolicy).toHaveBeenCalledWith('org-1', 'wf-1');
    });

    it('usa el pie de la imagen, o avisa si la política la apagó', async () => {
      const image = { type: 'image', image: { caption: 'mira' } };
      expect((await (await ycloud(image)).getInterpretedMessage()).text).toBe('mira');
      withPolicy({ image: { enabled: false } });
      expect(await (await meta(image)).getInterpretedMessage()).toEqual({ notice: 'imagen apagada' });
    });

    it('avisa de video, formatos no soportados y política de audio apagada', async () => {
      expect((await (await ycloud({ type: 'video' })).getInterpretedMessage()).notice).toBe(
        'video no soportado',
      );
      expect((await (await meta({ type: 'sticker' })).getInterpretedMessage()).notice).toBe(
        'formato no soportado',
      );
      withPolicy({ audio: { enabled: false } });
      expect((await (await ycloud({ type: 'audio' })).getInterpretedMessage()).notice).toBe(
        'audio apagado',
      );
      expect(mediaProcessing.processIncomingAttachments).not.toHaveBeenCalled();
    });

    it('no interpreta ni avisa un evento NotAllowed', async () => {
      const status = await build(MetaPayloadConsumer, {
        object: 'whatsapp_business_account',
        entry: [{ id: 'w', changes: [{ field: 'messages', value: { statuses: [] } }] }],
      });
      expect(await status.getInterpretedMessage()).toEqual({});
      expect(workflows.getChannelPolicy).not.toHaveBeenCalled();
    });

    it('YCloud transcribe el audio desde el link, sin headers', async () => {
      mediaProcessing.processIncomingAttachments.mockResolvedValue({ attachments: [transcribed] });
      const result = await (
        await ycloud({
          type: 'audio',
          audio: { link: 'https://y.cloud/a.ogg', mime_type: 'audio/ogg', sha256: 'abc' },
        })
      ).getInterpretedMessage();

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

    it('Meta resuelve el id contra la Graph API y baja el audio con el token descifrado', async () => {
      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ url: 'https://lookaside.fb/a', mime_type: 'audio/ogg; codecs=opus', sha256: 'h' }),
      } as any);
      mediaProcessing.processIncomingAttachments.mockResolvedValue({ attachments: [transcribed] });

      const result = await (
        await meta({ type: 'audio', audio: { id: 'media-1', sha256: 'abc' } })
      ).getInterpretedMessage();

      expect(whatsappConfig.decryptSessionData).toHaveBeenCalledWith(account);
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
      whatsappConfig.decryptSessionData.mockResolvedValueOnce({});
      const noToken = await (await meta({ type: 'audio', audio: { id: 'media-1' } })).getInterpretedMessage();
      expect(noToken.notice).toBe('no pude escuchar el audio');
      expect(noToken.mediaError).toContain('accessToken');

      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 400 } as any);
      const failed = await (await meta({ type: 'audio', audio: { id: 'media-1' } })).getInterpretedMessage();
      expect(failed).toEqual({
        notice: 'no pude escuchar el audio',
        mediaError: expect.stringContaining('400'),
      });
      fetchMock.mockRestore();
    });

    it('avisa cuando el audio excede el límite o no se pudo transcribir', async () => {
      mediaProcessing.processIncomingAttachments.mockResolvedValueOnce({
        attachments: [{ tooLarge: true, sizeBytes: 9_000_000 }],
      });
      const audio = { type: 'audio', audio: { link: 'https://y.cloud/a.ogg' } };
      expect((await (await ycloud(audio)).getInterpretedMessage()).notice).toBe('audio muy largo');

      mediaProcessing.processIncomingAttachments.mockResolvedValueOnce({
        attachments: [{ processingError: 'boom' }],
      });
      expect(await (await ycloud(audio)).getInterpretedMessage()).toEqual({
        notice: 'no pude escuchar el audio',
        mediaError: 'boom',
      });
    });
  });

  describe('WBPayloadConsumerResolver', () => {
    const resolver = () =>
      new WBPayloadConsumerResolver(
        mockLogger,
        mediaProcessing as any,
        workflows as any,
        whatsappConfig as any,
      );

    it('crea el consumer del proveedor, ligado al payload recibido y con su cuenta resuelta', async () => {
      const ycloudEvent = { type: 'whatsapp.smb.message.echoes', whatsappMessage: { from: '+525511111111' } };
      const consumer = await resolver().forProvider('ycloud', ycloudEvent);
      expect(consumer).toBeInstanceOf(YCloudPayloadConsumer);
      expect(consumer.getWBEventType()).toBe(WBEventTypes.MsgEchoes);
      expect(whatsappConfig.getWhatsappConfigByPhoneNumber).toHaveBeenCalledWith('+525511111111');
      expect(await resolver().forProvider('meta', {})).toBeInstanceOf(MetaPayloadConsumer);
    });

    it('no comparte estado entre payloads: cada llamada es una instancia nueva', async () => {
      const echo = await resolver().forProvider('ycloud', { type: 'whatsapp.smb.message.echoes' });
      const received = await resolver().forProvider('ycloud', { type: 'whatsapp.inbound_message.received' });
      expect(echo.getWBEventType()).toBe(WBEventTypes.MsgEchoes);
      expect(received.getWBEventType()).toBe(WBEventTypes.MsgReceived);
    });

    it('rechaza proveedores desconocidos, incluidas claves heredadas del prototipo', async () => {
      await expect(resolver().forProvider('twilio', {})).rejects.toThrow('twilio');
      await expect(resolver().forProvider('toString', {})).rejects.toThrow('toString');
    });
  });
});
