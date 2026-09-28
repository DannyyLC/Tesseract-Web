import { of, throwError } from 'rxjs';
import { MetaTransporter } from './meta.transporter';
import { WBTransporterResolver } from './wb-transporter.resolver';
import { WBSender } from './wb-transporter.interface';
import { YCloudTransporter } from './ycloud.transporter';

describe('WhatsApp transporters', () => {
  const mockHttpService: any = { post: jest.fn() };
  const mockLogger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() } as any;

  const sender: WBSender = {
    configId: 'cfg-1',
    phoneNumber: '+525511111111',
    sessionData: { phoneNumberId: '1234567890', accessToken: 'meta-token' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockHttpService.post.mockReturnValue(of({ data: {} }));
  });

  describe('YCloudTransporter', () => {
    const transporter = new YCloudTransporter(mockHttpService, mockLogger);

    it('manda texto a sendDirectly con el número remitente como from', async () => {
      await transporter.sendTxtMessage(sender, '+525522222222', 'hola');

      expect(mockHttpService.post).toHaveBeenCalledWith(
        `${YCloudTransporter.api_base_url}/whatsapp/messages/sendDirectly`,
        {
          from: '+525511111111',
          to: '+525522222222',
          type: 'text',
          text: { body: 'hola', preview_url: false },
        },
        expect.objectContaining({ headers: expect.objectContaining({ 'X-API-Key': expect.any(String) }) }),
      );
    });

    it('arma los componentes de la plantilla con policy deterministic', async () => {
      await transporter.sendTemplate(sender, '+525522222222', {
        name: 'recordatorio',
        language: 'es_MX',
        variables: { header: ['Hola'], body: ['Juan'], buttons: ['OK'] },
      });

      const [, body] = mockHttpService.post.mock.calls[0];
      expect(body.template).toEqual({
        name: 'recordatorio',
        language: { code: 'es_MX', policy: 'deterministic' },
        components: [
          { type: 'header', parameters: [{ type: 'text', text: 'Hola' }] },
          { type: 'body', parameters: [{ type: 'text', text: 'Juan' }] },
          {
            type: 'button',
            sub_type: 'quick_reply',
            index: 0,
            parameters: [{ type: 'payload', payload: 'OK' }],
          },
        ],
      });
    });
  });

  describe('MetaTransporter', () => {
    const transporter = new MetaTransporter(mockHttpService, mockLogger);

    it('envía por phone_number_id con Bearer y messaging_product', async () => {
      await transporter.sendTxtMessage(sender, '+525522222222', 'hola');

      expect(mockHttpService.post).toHaveBeenCalledWith(
        `${MetaTransporter.api_base_url}/1234567890/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: '+525522222222',
          type: 'text',
          text: { body: 'hola', preview_url: false },
        },
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Bearer /) }),
        }),
      );
    });

    it('falla con un error claro si la config no tiene phoneNumberId', async () => {
      await expect(
        transporter.sendTxtMessage({ ...sender, sessionData: null }, '+525522222222', 'hola'),
      ).rejects.toThrow('cfg-1');
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });
  });

  describe('sendFiles', () => {
    const transporter = new YCloudTransporter(mockHttpService, mockLogger);

    it('agrega filename solo a documentos y sigue aunque falle un archivo', async () => {
      jest.useFakeTimers();
      mockHttpService.post
        .mockReturnValueOnce(throwError(() => ({ response: { data: { code: 'bad' } } })))
        .mockReturnValueOnce(of({ data: {} }));

      const pending = transporter.sendFiles(sender, '+525522222222', [
        { type: 'video', name: 'a.mp4', link: 'https://x/a' },
        { type: 'document', name: 'b.pdf', link: 'https://x/b' },
      ]);
      await jest.runAllTimersAsync();
      await pending;
      jest.useRealTimers();

      expect(mockHttpService.post).toHaveBeenCalledTimes(2);
      expect(mockHttpService.post.mock.calls[0][1].video).toEqual({ link: 'https://x/a' });
      expect(mockHttpService.post.mock.calls[1][1].document).toEqual({
        link: 'https://x/b',
        filename: 'b.pdf',
      });
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('"code":"bad"'));
    });
  });

  describe('markMessagesAsRead', () => {
    it('YCloud: pega a inboundMessages/:id/typingIndicator por cada mensaje', async () => {
      const transporter = new YCloudTransporter(mockHttpService, mockLogger);

      await transporter.markMessagesAsRead(sender, ['m-1', 'm-2']);

      expect(mockHttpService.post).toHaveBeenCalledTimes(2);
      expect(mockHttpService.post).toHaveBeenCalledWith(
        `${YCloudTransporter.api_base_url}/whatsapp/inboundMessages/m-1/typingIndicator`,
        {},
        expect.objectContaining({ headers: expect.objectContaining({ 'X-API-Key': expect.any(String) }) }),
      );
      expect(mockHttpService.post).toHaveBeenCalledWith(
        `${YCloudTransporter.api_base_url}/whatsapp/inboundMessages/m-2/typingIndicator`,
        {},
        expect.anything(),
      );
    });

    it('Meta: manda status read y typing_indicator al endpoint de mensajes', async () => {
      const transporter = new MetaTransporter(mockHttpService, mockLogger);

      await transporter.markMessagesAsRead(sender, ['wamid.1']);

      expect(mockHttpService.post).toHaveBeenCalledWith(
        `${MetaTransporter.api_base_url}/1234567890/messages`,
        {
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: 'wamid.1',
          typing_indicator: { type: 'text' },
        },
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Bearer /) }),
        }),
      );
    });

    it('sigue con el resto si un mensaje falla, y lo registra', async () => {
      const transporter = new YCloudTransporter(mockHttpService, mockLogger);
      mockHttpService.post
        .mockReturnValueOnce(throwError(() => ({ message: 'boom' })))
        .mockReturnValueOnce(of({ data: {} }));

      await transporter.markMessagesAsRead(sender, ['m-1', 'm-2']);

      expect(mockHttpService.post).toHaveBeenCalledTimes(2);
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('m-1'));
    });
  });

  describe('WBTransporterResolver', () => {
    const ycloud = new YCloudTransporter(mockHttpService, mockLogger);
    const meta = new MetaTransporter(mockHttpService, mockLogger);
    const resolver = new WBTransporterResolver(ycloud, meta);

    it('elige el transporter según el provider de la config', () => {
      expect(resolver.forProvider('ycloud')).toBe(ycloud);
      expect(resolver.forProvider('meta')).toBe(meta);
    });

    it('rechaza proveedores desconocidos, incluidas claves heredadas del prototipo', () => {
      expect(() => resolver.forProvider('twilio')).toThrow('twilio');
      expect(() => resolver.forProvider('toString')).toThrow('toString');
    });
  });
});
