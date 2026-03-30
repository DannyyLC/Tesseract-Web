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

  const mockLogger = { error: jest.fn() } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WhatsappConfigService(mockPrisma, mockLogger);
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
      expect(mockPrisma.whatsAppConfig.findFirst).toHaveBeenCalledWith({ where: { phoneNumber: '+123' } });
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
      expect(mockPrisma.whatsAppConfig.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ phoneNumber: '+1', provider: 'ycloud' }) }));
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
      expect(mockPrisma.whatsAppConfig.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { phoneNumber: '+2' } });
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
      expect(mockPrisma.whatsAppConfig.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org', defaultWorkflowId: 'wf' } }));
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

    it('returns true for valid signature', async () => {
      const payload = JSON.stringify({ hello: 'world' });
      const timestamp = `${Date.now()}`;
      const signedPayload = `${timestamp}.${payload}`;
      const expectedSignature = crypto.createHmac('sha256', process.env.Y_CLOUD_WEBHOOK_SECRET || '').update(signedPayload).digest('hex');
      const header = `t=${timestamp},s=${expectedSignature}`;

      const res = await service.verifySignature(payload, header);
      expect(res).toBe(true);
    });

    it('returns false for invalid signature', async () => {
      const payload = 'x';
      const header = `t=123,s=invalid`;
      const res = await service.verifySignature(payload, header);
      expect(res).toBe(false);
    });
  });
});
