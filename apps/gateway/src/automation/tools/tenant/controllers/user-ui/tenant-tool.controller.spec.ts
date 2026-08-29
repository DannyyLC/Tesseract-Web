import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { HttpStatusCode } from 'axios';
import { TenantToolController } from './tenant-tool.controller';
import { TenantToolService } from '../../tenant-tool.service';

describe('TenantToolController', () => {
  let controller: TenantToolController;

  const mockTenantToolService = {
    getWhatsappOutboundStatus: jest.fn(),
    linkWhatsappOutboundWorkflows: jest.fn(),
  };

  const mockResponse = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res as Response;
  };

  const user = { sub: 'user-1', organizationId: 'org-1', role: 'OWNER' } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantToolController],
      providers: [{ provide: TenantToolService, useValue: mockTenantToolService }],
    }).compile();

    controller = module.get<TenantToolController>(TenantToolController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getWhatsappOutboundStatus', () => {
    it('resuelve el estado con la organización del JWT y responde 200', async () => {
      const res = mockResponse();
      const status = {
        hasWhatsappConfig: true,
        tenantToolId: 'tt-1',
        unlinkedWorkflows: [],
      };
      mockTenantToolService.getWhatsappOutboundStatus.mockResolvedValue(status);

      await controller.getWhatsappOutboundStatus(user, res);

      expect(mockTenantToolService.getWhatsappOutboundStatus).toHaveBeenCalledWith('org-1');
      expect(res.status).toHaveBeenCalledWith(HttpStatusCode.Ok);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: status }),
      );
    });
  });

  describe('linkWhatsappOutboundWorkflows', () => {
    it('engancha los workflows con la organización y el usuario del JWT y responde 200', async () => {
      const res = mockResponse();
      const updated = { id: 'tt-1' };
      mockTenantToolService.linkWhatsappOutboundWorkflows.mockResolvedValue(updated);

      await controller.linkWhatsappOutboundWorkflows({ workflowIds: ['w1', 'w2'] }, user, res);

      expect(mockTenantToolService.linkWhatsappOutboundWorkflows).toHaveBeenCalledWith(
        'org-1',
        'user-1',
        ['w1', 'w2'],
      );
      expect(res.status).toHaveBeenCalledWith(HttpStatusCode.Ok);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: updated }),
      );
    });

    it('responde 400 con el mensaje del error cuando el servicio lanza', async () => {
      const res = mockResponse();
      mockTenantToolService.linkWhatsappOutboundWorkflows.mockRejectedValue(
        new Error('Workflow not found in this organization'),
      );

      await controller.linkWhatsappOutboundWorkflows({ workflowIds: ['w1'] }, user, res);

      expect(res.status).toHaveBeenCalledWith(HttpStatusCode.BadRequest);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Workflow not found in this organization',
        }),
      );
    });
  });
});
