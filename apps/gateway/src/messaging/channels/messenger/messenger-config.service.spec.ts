import * as crypto from 'crypto';
import { of } from 'rxjs';
import { MessengerConfigService } from './messenger-config.service';

const APP_SECRET = 'app-secret';
const VERIFY_TOKEN = 'verify-token';

describe('MessengerConfigService', () => {
  let service: MessengerConfigService;

  const mockPrisma: any = {
    messengerConfig: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
    workflow: { findUnique: jest.fn() },
  };

  const mockHttpService: any = { post: jest.fn(() => of({ data: {} })) };
  const mockKmsService: any = {
    encrypt: jest.fn(async (value: string) => `enc(${value})`),
    decrypt: jest.fn(async (value: string) => value.replace(/^enc\((.*)\)$/, '$1')),
  };
  const mockDriveService: any = { getFilesFromPublicFolder: jest.fn() };
  const mockConversationsService: any = { addMessage: jest.fn(), update: jest.fn() };
  const mockLogger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() } as any;

  const config: any = { id: 'c1', pageId: 'page-1', pageAccessToken: 'enc(page-token)' };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MESSENGER_APP_SECRET = APP_SECRET;
    process.env.MESSENGER_VERIFY_TOKEN = VERIFY_TOKEN;
    service = new MessengerConfigService(
      mockPrisma,
      mockHttpService,
      mockKmsService,
      mockDriveService,
      mockConversationsService,
      mockLogger,
    );
  });

  describe('getMessengerConfigByPageId', () => {
    it('returns record when found', async () => {
      mockPrisma.messengerConfig.findFirst.mockResolvedValue(config);
      const res = await service.getMessengerConfigByPageId('page-1');
      expect(mockPrisma.messengerConfig.findFirst).toHaveBeenCalledWith({
        where: { pageId: 'page-1', deletedAt: null },
      });
      expect(res).toEqual(config);
    });

    it('returns null and logs on error', async () => {
      mockPrisma.messengerConfig.findFirst.mockRejectedValue(new Error('db'));
      expect(await service.getMessengerConfigByPageId('page-1')).toBeNull();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('updateConfig', () => {
    it('cifra las credenciales y limpia los espacios de los textos', async () => {
      mockPrisma.messengerConfig.update.mockResolvedValue(config);

      expect(
        await service.updateConfig('c1', {
          pageName: '  Página nueva  ',
          description: '  nota  ',
          appSecret: ' secreto ',
          pageAccessToken: ' token ',
        }),
      ).toBe(true);

      expect(mockPrisma.messengerConfig.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: {
          pageName: 'Página nueva',
          description: 'nota',
          appSecret: 'enc(secreto)',
          pageAccessToken: 'enc(token)',
        },
      });
    });

    it('conserva las credenciales que llegan vacías', async () => {
      mockPrisma.messengerConfig.update.mockResolvedValue(config);

      await service.updateConfig('c1', {
        pageName: 'Página',
        appSecret: '',
        pageAccessToken: '   ',
      });

      expect(mockPrisma.messengerConfig.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { pageName: 'Página' },
      });
      expect(mockKmsService.encrypt).not.toHaveBeenCalled();
    });

    it('actualiza el pageId cuando llega un valor válido', async () => {
      mockPrisma.messengerConfig.update.mockResolvedValue(config);

      await service.updateConfig('c1', {
        pageId: '  page-2  ',
        pageName: 'Página nueva',
      });

      expect(mockPrisma.messengerConfig.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: {
          pageId: 'page-2',
          pageName: 'Página nueva',
        },
      });
    });

    it('vacía la descripción a NULL, pero no el nombre', async () => {
      mockPrisma.messengerConfig.update.mockResolvedValue(config);

      await service.updateConfig('c1', { pageName: '   ', description: '' });

      expect(mockPrisma.messengerConfig.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { description: null },
      });
    });

    it('no toca la base cuando no llega ningún campo', async () => {
      expect(await service.updateConfig('c1', {})).toBe(true);
      expect(mockPrisma.messengerConfig.update).not.toHaveBeenCalled();
    });

    it('devuelve false y lo registra si la escritura falla', async () => {
      mockPrisma.messengerConfig.update.mockRejectedValue(new Error('db'));
      expect(await service.updateConfig('c1', { pageName: 'Página' })).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('verifySubscription', () => {
    it('accepts the configured token', () => {
      expect(service.verifySubscription('subscribe', VERIFY_TOKEN)).toBe(true);
    });

    it('rejects a wrong token, a wrong mode and an empty token', () => {
      expect(service.verifySubscription('subscribe', 'nope')).toBe(false);
      expect(service.verifySubscription('unsubscribe', VERIFY_TOKEN)).toBe(false);
      expect(service.verifySubscription('subscribe', '')).toBe(false);
    });
  });

  describe('verifySignature', () => {
    const PAGE_SECRET = 'secreto-de-la-pagina';
    const sign = (payload: string, secret: string) =>
      `sha256=${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;

    /** Config con su propio app secret cifrado, como quedaría en la base. */
    const withOwnSecret: any = { ...config, appSecret: `enc(${PAGE_SECRET})` };
    /** Config sin app secret propio: debe caer al MESSENGER_APP_SECRET del entorno. */
    const withoutOwnSecret: any = { ...config, appSecret: null };

    it('accepts a signature computed with the secret stored on the config', async () => {
      const payload = '{"object":"page"}';
      expect(await service.verifySignature(payload, sign(payload, PAGE_SECRET), withOwnSecret)).toBe(
        true,
      );
      expect(mockKmsService.decrypt).toHaveBeenCalledWith(`enc(${PAGE_SECRET})`);
    });

    it('does NOT accept the env secret when the config carries its own', async () => {
      // Es el punto del cambio: cada tenant se valida contra SU secreto, así que el
      // del entorno no debe servir de comodín para una página que ya tiene el suyo.
      const payload = '{"object":"page"}';
      expect(await service.verifySignature(payload, sign(payload, APP_SECRET), withOwnSecret)).toBe(
        false,
      );
    });

    it('falls back to the env secret when the config has none', async () => {
      const payload = '{"object":"page"}';
      expect(
        await service.verifySignature(payload, sign(payload, APP_SECRET), withoutOwnSecret),
      ).toBe(true);
      expect(mockKmsService.decrypt).not.toHaveBeenCalled();
    });

    it('rejects a signature from another secret', async () => {
      const payload = '{"object":"page"}';
      expect(await service.verifySignature(payload, sign(payload, 'otro'), withOwnSecret)).toBe(
        false,
      );
    });

    it('rejects a tampered body', async () => {
      const signature = sign('{"object":"page"}', PAGE_SECRET);
      expect(await service.verifySignature('{"object":"instagram"}', signature, withOwnSecret)).toBe(
        false,
      );
    });

    it('rejects malformed or missing headers instead of throwing', async () => {
      expect(await service.verifySignature('{}', '', withOwnSecret)).toBe(false);
      expect(await service.verifySignature('{}', 'garbage', withOwnSecret)).toBe(false);
      expect(await service.verifySignature('{}', 'sha1=abc', withOwnSecret)).toBe(false);
    });

    it('fails closed when the stored secret cannot be decrypted', async () => {
      // Caer al secreto del entorno aquí validaría a un tenant con la llave de otro.
      mockKmsService.decrypt.mockRejectedValueOnce(new Error('kms down'));
      const payload = '{"object":"page"}';
      expect(await service.verifySignature(payload, sign(payload, APP_SECRET), withOwnSecret)).toBe(
        false,
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('sanitizeOutput', () => {
    it('strips Markdown that Messenger would render literally', async () => {
      const res = await service.sanitizeOutput(
        '## Título\n**negrita** y _cursiva_ y `code`\n- uno\n- dos',
      );
      expect(res).toBe('Título\nnegrita y cursiva y code\n• uno\n• dos');
    });

    it('turns links into text plus url', async () => {
      expect(await service.sanitizeOutput('[Docs](https://x.dev)')).toBe('Docs (https://x.dev)');
    });
  });

  describe('sendTextMessage', () => {
    it('splits texts longer than the Send API limit into several messages', async () => {
      const paragraph = 'a'.repeat(1500);
      await service.sendTextMessage(config, 'psid-1', `${paragraph}\n\n${paragraph}`);

      expect(mockHttpService.post).toHaveBeenCalledTimes(2);
      for (const call of mockHttpService.post.mock.calls) {
        expect(call[1].message.text.length).toBeLessThanOrEqual(2000);
        expect(call[1].recipient).toEqual({ id: 'psid-1' });
      }
    });

    it('sends a short text as a single message and decrypts the page token', async () => {
      await service.sendTextMessage(config, 'psid-1', 'hola');

      expect(mockKmsService.decrypt).toHaveBeenCalledWith('enc(page-token)');
      expect(mockHttpService.post).toHaveBeenCalledTimes(1);
      const [, body, options] = mockHttpService.post.mock.calls[0];
      expect(body.message.text).toBe('hola');
      expect(options.params.access_token).toBe('page-token');
    });

    it('falls back to the env token when the config has none', async () => {
      process.env.MESSENGER_PAGE_ACCESS_TOKEN = 'env-token';
      const fallbackService = new MessengerConfigService(
        mockPrisma,
        mockHttpService,
        mockKmsService,
        mockDriveService,
        mockConversationsService,
        mockLogger,
      );

      await fallbackService.sendTextMessage({ ...config, pageAccessToken: null }, 'psid-1', 'hola');

      expect(mockKmsService.decrypt).not.toHaveBeenCalled();
      expect(mockHttpService.post.mock.calls[0][2].params.access_token).toBe('env-token');
      delete process.env.MESSENGER_PAGE_ACCESS_TOKEN;
    });
  });

  describe('handleActionsDerivatedFromMetadata', () => {
    it('does nothing when the workflow declares no post_turn_actions', async () => {
      mockPrisma.workflow.findUnique.mockResolvedValue({ config: {} });

      await service.handleActionsDerivatedFromMetadata(
        'conv-1',
        'org-1',
        { variables: { media_url: 'https://drive.google.com/x' } } as any,
        config,
        'psid-1',
        'wf-1',
      );

      expect(mockHttpService.post).not.toHaveBeenCalled();
      expect(mockConversationsService.update).not.toHaveBeenCalled();
    });

    it('runs a declared send_text_message and records it in the conversation', async () => {
      mockPrisma.workflow.findUnique.mockResolvedValue({
        config: {
          post_turn_actions: [
            {
              id: 'aviso',
              when: { variable: 'ready' },
              action: 'send_text_message',
              params: { text: 'Listo' },
              once_per_conversation: true,
            },
          ],
        },
      });

      await service.handleActionsDerivatedFromMetadata(
        'conv-1',
        'org-1',
        { variables: { ready: 'si' } } as any,
        config,
        'psid-1',
        'wf-1',
      );

      expect(mockHttpService.post.mock.calls[0][1].message.text).toBe('Listo');
      expect(mockConversationsService.addMessage).toHaveBeenCalledWith(
        'conv-1',
        'ASSISTANT',
        'Listo',
        { postTurnAction: 'aviso' },
      );
      expect(mockConversationsService.update).toHaveBeenCalledWith('org-1', 'conv-1', {
        metadata: { variables: { ready: 'si' }, postTurnActions: { aviso: true } },
      });
    });
  });
});
