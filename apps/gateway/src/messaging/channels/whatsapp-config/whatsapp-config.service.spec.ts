import { WhatsappConfigService } from './whatsapp-config.service';
import * as crypto from 'crypto';

describe('WhatsappConfigService', () => {
  let service: WhatsappConfigService;

  const mockPrisma: any = {
    whatsAppConfig: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const mockHttpService: any = {
    axiosRef: { post: jest.fn(), get: jest.fn() },
  };

  const mockLogger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() } as any;

  const mockDriveService: any = { getFilesFromPublicFolder: jest.fn() };
  const mockConversationsService: any = { update: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WhatsappConfigService(
      mockPrisma,
      mockHttpService,
      mockDriveService,
      mockConversationsService,
      mockLogger,
    );
  });

  describe('getWhatsappConfigById', () => {
    it('returns record when found', async () => {
      const record = { id: 'r1' };
      mockPrisma.whatsAppConfig.findUnique.mockResolvedValue(record);
      const res = await service.getWhatsappConfigById('r1');
      expect(mockPrisma.whatsAppConfig.findUnique).toHaveBeenCalledWith({ where: { id: 'r1' } });
      expect(res).toEqual(record);
    });

    it('returns null and logs on error', async () => {
      mockPrisma.whatsAppConfig.findUnique.mockRejectedValue(new Error('db'));
      const res = await service.getWhatsappConfigById('r1');
      expect(mockLogger.error).toHaveBeenCalled();
      expect(res).toBeNull();
    });
  });

  describe('getWhatsappConfigByPhoneNumber', () => {
    it('returns record when found', async () => {
      const record = { id: 'r2' };
      mockPrisma.whatsAppConfig.findFirst.mockResolvedValue(record);
      const res = await service.getWhatsappConfigByPhoneNumber('+123');
      expect(mockPrisma.whatsAppConfig.findFirst).toHaveBeenCalledWith({
        where: { phoneNumber: '+123' },
      });
      expect(res).toEqual(record);
    });

    it('returns null and logs on error', async () => {
      mockPrisma.whatsAppConfig.findFirst.mockRejectedValue(new Error('boom'));
      const res = await service.getWhatsappConfigByPhoneNumber('+123');
      expect(mockLogger.error).toHaveBeenCalled();
      expect(res).toBeNull();
    });
  });

  describe('createRecordAndgenerateWebhookSecret', () => {
    const origDomain = process.env.DOMAIN_BASE_URL;
    beforeEach(() => {
      process.env.DOMAIN_BASE_URL = 'https://example.com';
    });
    afterEach(() => {
      process.env.DOMAIN_BASE_URL = origDomain;
    });

    it('creates a new record and returns it', async () => {
      const created = { id: 'n1', phoneNumber: '+1' };
      mockPrisma.whatsAppConfig.create.mockResolvedValue(created);
      const res = await service.createRecordAndgenerateWebhookSecret('org-1', 'wf-1', '+1');
      expect(mockPrisma.whatsAppConfig.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ phoneNumber: '+1', provider: 'ycloud' }),
        }),
      );
      expect(res).toEqual(created);
    });

    it('returns null on create error and logs', async () => {
      mockPrisma.whatsAppConfig.create.mockRejectedValue(new Error('nope'));
      const res = await service.createRecordAndgenerateWebhookSecret('org-1', 'wf-1', '+1');
      expect(mockLogger.error).toHaveBeenCalled();
      expect(res).toBeNull();
    });
  });

  describe('updatePhoneNumber', () => {
    it('calls update and resolves', async () => {
      mockPrisma.whatsAppConfig.update.mockResolvedValue({});
      await expect(service.updatePhoneNumber('c1', '+2')).resolves.toBeUndefined();
      expect(mockPrisma.whatsAppConfig.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { phoneNumber: '+2' },
      });
    });

    it('logs on error and does not throw', async () => {
      mockPrisma.whatsAppConfig.update.mockRejectedValue(new Error('err'));
      await expect(service.updatePhoneNumber('c1', '+2')).resolves.toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('deleteRecord', () => {
    it('returns true on successful delete', async () => {
      mockPrisma.whatsAppConfig.delete.mockResolvedValue({});
      const res = await service.deleteRecord('c1');
      expect(res).toBe(true);
    });

    it('returns false on delete error and logs', async () => {
      mockPrisma.whatsAppConfig.delete.mockRejectedValue(new Error('err'));
      const res = await service.deleteRecord('c1');
      expect(res).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getConfigsByOrganizationAndWorkflow', () => {
    it('returns list of configs', async () => {
      const list = [{ id: 'a' }];
      mockPrisma.whatsAppConfig.findMany.mockResolvedValue(list);
      const res = await service.getConfigsByOrganizationAndWorkflow('org', 'wf');
      expect(mockPrisma.whatsAppConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org', defaultWorkflowId: 'wf' } }),
      );
      expect(res).toEqual(list);
    });

    it('returns empty array on error and logs', async () => {
      mockPrisma.whatsAppConfig.findMany.mockRejectedValue(new Error('boom'));
      const res = await service.getConfigsByOrganizationAndWorkflow('org', 'wf');
      expect(res).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('updateIsActive', () => {
    it('returns true when update succeeds', async () => {
      mockPrisma.whatsAppConfig.update.mockResolvedValue({});
      const res = await service.updateIsActive('c1', true);
      expect(res).toBe(true);
    });

    it('returns false and logs when update fails', async () => {
      mockPrisma.whatsAppConfig.update.mockRejectedValue(new Error('err'));
      const res = await service.updateIsActive('c1', false);
      expect(res).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('updateConnectionStatus', () => {
    it('returns true when update succeeds', async () => {
      mockPrisma.whatsAppConfig.update.mockResolvedValue({});
      const res = await service.updateConnectionStatus('c1', 'CONNECTED' as any);
      expect(res).toBe(true);
    });

    it('returns false and logs when update fails', async () => {
      mockPrisma.whatsAppConfig.update.mockRejectedValue(new Error('err'));
      const res = await service.updateConnectionStatus('c1', 'DISCONNECTED' as any);
      expect(res).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('verifySignature', () => {
    const origSecret = process.env.Y_CLOUD_WEBHOOK_SECRET;
    beforeEach(() => {
      process.env.Y_CLOUD_WEBHOOK_SECRET = 'test-secret';
    });
    afterEach(() => {
      process.env.Y_CLOUD_WEBHOOK_SECRET = origSecret;
    });

    /** Construye un header de firma válido para el payload dado. */
    const signHeader = (payload: string, timestamp: string, key: 's' | 'v1' = 's') => {
      const signature = crypto
        .createHmac('sha256', process.env.Y_CLOUD_WEBHOOK_SECRET || '')
        .update(`${timestamp}.${payload}`)
        .digest('hex');
      return `t=${timestamp},${key}=${signature}`;
    };

    it('returns true for valid signature', () => {
      const payload = JSON.stringify({ hello: 'world' });
      const timestamp = `${Date.now()}`;

      expect(service.verifySignature(payload, signHeader(payload, timestamp))).toBe(true);
    });

    it('returns false for invalid signature', () => {
      expect(service.verifySignature('x', 't=123,s=invalid')).toBe(false);
    });

    // La llave de la firma no está confirmada del lado de YCloud: el código
    // anterior tomaba parts[1] sin mirar el nombre. Se aceptan ambas.
    it('acepta la firma tanto en v1= como en s=', () => {
      const payload = '{"a":1}';
      const timestamp = `${Date.now()}`;

      expect(service.verifySignature(payload, signHeader(payload, timestamp, 's'))).toBe(true);
      expect(service.verifySignature(payload, signHeader(payload, timestamp, 'v1'))).toBe(true);
    });

    // Idem con la unidad del timestamp: se detecta sola.
    it('acepta timestamps en segundos y en milisegundos', () => {
      const payload = '{"a":1}';
      const seconds = `${Math.floor(Date.now() / 1000)}`;
      const millis = `${Date.now()}`;

      expect(service.verifySignature(payload, signHeader(payload, seconds))).toBe(true);
      expect(service.verifySignature(payload, signHeader(payload, millis))).toBe(true);
    });

    it('rechaza firmas viejas para cerrar la ventana de replay', () => {
      const payload = '{"a":1}';
      const oldTimestamp = `${Math.floor(Date.now() / 1000) - 3600}`;

      expect(service.verifySignature(payload, signHeader(payload, oldTimestamp))).toBe(false);
    });

    // Antes, un header vacío o malformado lanzaba TypeError.
    it.each([
      ['header vacío', ''],
      ['sin separadores', 'garbage'],
      ['solo timestamp', 't=123'],
      ['solo firma', 's=abc'],
      ['timestamp no numérico', 't=abc,s=def'],
    ])('devuelve false sin lanzar con %s', (_label, header) => {
      expect(() => service.verifySignature('x', header)).not.toThrow();
      expect(service.verifySignature('x', header)).toBe(false);
    });

    it('devuelve false si no hay secreto configurado', () => {
      delete process.env.Y_CLOUD_WEBHOOK_SECRET;
      expect(service.verifySignature('x', 't=123,s=abc')).toBe(false);
    });
  });
});
