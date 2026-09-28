import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WhatsappConfigAdminController } from './whatsapp-config.admin.controller';
import { WhatsappConfigService } from '../../whatsapp-config.service';
import { WorkflowsService } from '@/automation/workflows/workflows.service';

describe('WhatsappConfigAdminController', () => {
  let controller: WhatsappConfigAdminController;

  const mockWhatsappConfigService = {
    getConfigsByOrganization: jest.fn(),
    getWhatsappConfigByPhoneNumber: jest.fn(),
    isPhoneNumberTaken: jest.fn(),
    createRecordAndgenerateWebhookSecret: jest.fn(),
    getWhatsappConfigById: jest.fn(),
    updateConfig: jest.fn(),
    deleteRecord: jest.fn(),
    updateIsActive: jest.fn(),
    listTemplates: jest.fn(),
    createTemplate: jest.fn(),
    updateTemplate: jest.fn(),
    deleteTemplate: jest.fn(),
    getTemplate: jest.fn(),
  };

  const mockWorkflowsService = {
    getRoutingState: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsappConfigAdminController],
      providers: [
        { provide: WhatsappConfigService, useValue: mockWhatsappConfigService },
        { provide: WorkflowsService, useValue: mockWorkflowsService },
      ],
    }).compile();

    controller = module.get(WhatsappConfigAdminController);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('crea el número cuando el workflow es de esta organización', async () => {
      mockWhatsappConfigService.getWhatsappConfigByPhoneNumber.mockResolvedValue(null);
      mockWorkflowsService.getRoutingState.mockResolvedValue({ isActive: true });
      mockWhatsappConfigService.createRecordAndgenerateWebhookSecret.mockResolvedValue({ id: 'c-1' });

      const res = await controller.create('org-1', {
        phoneNumber: '+1',
        workflowId: 'wf-1',
        displayName: 'WhatsApp Ventas',
      } as any);

      expect(mockWorkflowsService.getRoutingState).toHaveBeenCalledWith('org-1', 'wf-1');
      expect(mockWhatsappConfigService.createRecordAndgenerateWebhookSecret).toHaveBeenCalledWith(
        'org-1',
        'wf-1',
        '+1',
        { displayName: 'WhatsApp Ventas', description: undefined },
        undefined,
      );
      expect(res.data).toEqual({
        id: 'c-1',
        credentials: { phoneNumberId: null, hasAppSecret: false, hasAccessToken: false },
      });
    });

    it('con provider meta guarda las credenciales en sessionData y no las devuelve', async () => {
      mockWhatsappConfigService.getWhatsappConfigByPhoneNumber.mockResolvedValue(null);
      mockWorkflowsService.getRoutingState.mockResolvedValue({ isActive: true });
      mockWhatsappConfigService.createRecordAndgenerateWebhookSecret.mockResolvedValue({
        id: 'c-1',
        provider: 'meta',
        sessionData: { accessToken: 'tok' },
      });

      const res = await controller.create('org-1', {
        phoneNumber: '+1',
        workflowId: 'wf-1',
        provider: 'meta',
        phoneNumberId: '123',
        appSecret: 'sec',
        accessToken: 'tok',
      } as any);

      expect(mockWhatsappConfigService.createRecordAndgenerateWebhookSecret).toHaveBeenCalledWith(
        'org-1',
        'wf-1',
        '+1',
        { displayName: undefined, description: undefined },
        {
          provider: 'meta',
          sessionData: { phoneNumberId: '123', appSecret: 'sec', accessToken: 'tok' },
        },
      );
      expect(res.data).toEqual({
        id: 'c-1',
        provider: 'meta',
        credentials: { phoneNumberId: null, hasAppSecret: false, hasAccessToken: true },
      });
    });

    it('rechaza si el teléfono ya existe', async () => {
      mockWhatsappConfigService.getWhatsappConfigByPhoneNumber.mockResolvedValue({ id: 'existing' });

      await expect(
        controller.create('org-1', { phoneNumber: '+1' } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockWhatsappConfigService.createRecordAndgenerateWebhookSecret).not.toHaveBeenCalled();
    });

    it('rechaza si el workflowId no es de esta organización', async () => {
      mockWhatsappConfigService.getWhatsappConfigByPhoneNumber.mockResolvedValue(null);
      // Ajeno, borrado o interno: los tres llegan como null, no como excepción.
      mockWorkflowsService.getRoutingState.mockResolvedValue(null);

      await expect(
        controller.create('org-1', { phoneNumber: '+1', workflowId: 'wf-ajeno' } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockWhatsappConfigService.createRecordAndgenerateWebhookSecret).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('no devuelve sessionData', async () => {
      mockWhatsappConfigService.getConfigsByOrganization.mockResolvedValue([
        { id: 'c-1', provider: 'meta', sessionData: { accessToken: 'tok', appSecret: 'sec' } },
      ]);

      const res = await controller.list('org-1');

      expect(res.data).toEqual([
        {
          id: 'c-1',
          provider: 'meta',
          credentials: { phoneNumberId: null, hasAppSecret: true, hasAccessToken: true },
        },
      ]);
      expect(JSON.stringify(res.data)).not.toMatch(/tok|sec/);
    });
  });

  describe('update', () => {
    it('rechaza si el config es de otra organización', async () => {
      mockWhatsappConfigService.getWhatsappConfigById.mockResolvedValue({
        id: 'c-1',
        organizationId: 'org-otra',
      });

      await expect(
        controller.update('org-1', 'c-1', { displayName: 'x' } as any),
      ).rejects.toThrow(NotFoundException);
      expect(mockWhatsappConfigService.updateConfig).not.toHaveBeenCalled();
    });

    it('reasigna el workflow cuando es de la misma organización', async () => {
      mockWhatsappConfigService.getWhatsappConfigById.mockResolvedValue({
        id: 'c-1',
        organizationId: 'org-1',
      });
      mockWorkflowsService.getRoutingState.mockResolvedValue({ isActive: true });
      mockWhatsappConfigService.updateConfig.mockResolvedValue(true);

      const res = await controller.update('org-1', 'c-1', { workflowId: 'wf-2' } as any);

      expect(mockWhatsappConfigService.updateConfig).toHaveBeenCalledWith('c-1', { workflowId: 'wf-2' });
      expect(res.data).toBe(true);
    });

    it('no valida workflow cuando se manda null (desasignar)', async () => {
      mockWhatsappConfigService.getWhatsappConfigById.mockResolvedValue({
        id: 'c-1',
        organizationId: 'org-1',
      });
      mockWhatsappConfigService.updateConfig.mockResolvedValue(true);

      await controller.update('org-1', 'c-1', { workflowId: null } as any);

      expect(mockWorkflowsService.getRoutingState).not.toHaveBeenCalled();
      expect(mockWhatsappConfigService.updateConfig).toHaveBeenCalledWith('c-1', { workflowId: null });
    });

    describe('credenciales de Meta', () => {
      const metaConfig = { id: 'c-1', organizationId: 'org-1', provider: 'meta', phoneNumber: '+1' };
      beforeEach(() => mockWhatsappConfigService.updateConfig.mockResolvedValue(true));

      it('manda solo las credenciales presentes como sessionData parcial', async () => {
        mockWhatsappConfigService.getWhatsappConfigById.mockResolvedValue(metaConfig);

        await controller.update('org-1', 'c-1', { displayName: 'x', accessToken: 'nuevo' } as any);

        expect(mockWhatsappConfigService.updateConfig).toHaveBeenCalledWith('c-1', {
          displayName: 'x',
          sessionData: { accessToken: 'nuevo' },
        });
      });

      it('sin credenciales no manda sessionData', async () => {
        mockWhatsappConfigService.getWhatsappConfigById.mockResolvedValue(metaConfig);

        await controller.update('org-1', 'c-1', { displayName: 'x' } as any);

        expect(mockWhatsappConfigService.updateConfig).toHaveBeenCalledWith('c-1', { displayName: 'x' });
      });

      it('rechaza credenciales en un número que no es de Meta', async () => {
        mockWhatsappConfigService.getWhatsappConfigById.mockResolvedValue({
          ...metaConfig,
          provider: 'ycloud',
        });

        await expect(
          controller.update('org-1', 'c-1', { accessToken: 'x' } as any),
        ).rejects.toThrow(BadRequestException);
        expect(mockWhatsappConfigService.updateConfig).not.toHaveBeenCalled();
      });
    });

    describe('phoneNumber', () => {
      beforeEach(() => {
        mockWhatsappConfigService.getWhatsappConfigById.mockResolvedValue({
          id: 'c-1',
          organizationId: 'org-1',
          phoneNumber: '+525511111111',
        });
        mockWhatsappConfigService.updateConfig.mockResolvedValue(true);
      });

      it('cambia el teléfono cuando está libre', async () => {
        mockWhatsappConfigService.isPhoneNumberTaken.mockResolvedValue(false);

        await controller.update('org-1', 'c-1', { phoneNumber: '+525522222222' } as any);

        expect(mockWhatsappConfigService.isPhoneNumberTaken).toHaveBeenCalledWith('+525522222222', 'c-1');
        expect(mockWhatsappConfigService.updateConfig).toHaveBeenCalledWith('c-1', {
          phoneNumber: '+525522222222',
        });
      });

      it('rechaza si otra config ya usa ese teléfono', async () => {
        mockWhatsappConfigService.isPhoneNumberTaken.mockResolvedValue(true);

        await expect(
          controller.update('org-1', 'c-1', { phoneNumber: '+525522222222' } as any),
        ).rejects.toThrow(BadRequestException);
        expect(mockWhatsappConfigService.updateConfig).not.toHaveBeenCalled();
      });

      it('si el teléfono no cambia, no consulta duplicados', async () => {
        await controller.update('org-1', 'c-1', { phoneNumber: '+525511111111', displayName: 'x' } as any);

        expect(mockWhatsappConfigService.isPhoneNumberTaken).not.toHaveBeenCalled();
      });
    });
  });

  describe('remove', () => {
    it('rechaza si el config es de otra organización', async () => {
      mockWhatsappConfigService.getWhatsappConfigById.mockResolvedValue({
        id: 'c-1',
        organizationId: 'org-otra',
      });

      await expect(controller.remove('org-1', 'c-1')).rejects.toThrow(NotFoundException);
      expect(mockWhatsappConfigService.deleteRecord).not.toHaveBeenCalled();
    });
  });

  describe('templates', () => {
    it('rechaza crear un template en un config de otra organización', async () => {
      mockWhatsappConfigService.getWhatsappConfigById.mockResolvedValue({
        id: 'c-1',
        organizationId: 'org-otra',
      });

      await expect(
        controller.createTemplate('org-1', 'c-1', { name: 't' } as any),
      ).rejects.toThrow(NotFoundException);
      expect(mockWhatsappConfigService.createTemplate).not.toHaveBeenCalled();
    });

    it('rechaza editar un template cuyo config es de otra organización', async () => {
      mockWhatsappConfigService.getTemplate.mockResolvedValue({ id: 't-1', whatsAppConfigId: 'c-1' });
      mockWhatsappConfigService.getWhatsappConfigById.mockResolvedValue({
        id: 'c-1',
        organizationId: 'org-otra',
      });

      await expect(
        controller.updateTemplate('org-1', 't-1', { name: 'x' } as any),
      ).rejects.toThrow(NotFoundException);
      expect(mockWhatsappConfigService.updateTemplate).not.toHaveBeenCalled();
    });

    it('permite editar un template cuyo config es de la misma organización', async () => {
      mockWhatsappConfigService.getTemplate.mockResolvedValue({ id: 't-1', whatsAppConfigId: 'c-1' });
      mockWhatsappConfigService.getWhatsappConfigById.mockResolvedValue({
        id: 'c-1',
        organizationId: 'org-1',
      });
      mockWhatsappConfigService.updateTemplate.mockResolvedValue({ id: 't-1', name: 'x' });

      const res = await controller.updateTemplate('org-1', 't-1', { name: 'x' } as any);

      expect(mockWhatsappConfigService.updateTemplate).toHaveBeenCalledWith('t-1', { name: 'x' });
      expect(res.data).toEqual({ id: 't-1', name: 'x' });
    });
  });
});
