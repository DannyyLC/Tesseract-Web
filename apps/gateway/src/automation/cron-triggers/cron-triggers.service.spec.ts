import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronTriggersService } from './cron-triggers.service';
import { PrismaService } from '../../platform/database/prisma.service';
import { WorkflowsService } from '../workflows/workflows.service';
import { CreateCronTriggerDto } from './dto';

describe('CronTriggersService', () => {
  let service: CronTriggersService;

  const mockPrismaService = {
    workflow: {
      findFirst: jest.fn(),
    },
    whatsAppConfig: {
      findFirst: jest.fn(),
    },
    workflowCronTrigger: {
      create: jest.fn(),
    },
  };

  const mockSchedulerRegistry = {
    addCronJob: jest.fn(),
    deleteCronJob: jest.fn(),
    doesExist: jest.fn().mockReturnValue(false),
  };

  const mockWorkflowsService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronTriggersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SchedulerRegistry, useValue: mockSchedulerRegistry },
        { provide: WorkflowsService, useValue: mockWorkflowsService },
      ],
    }).compile();

    service = module.get<CronTriggersService>(CronTriggersService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const dto: CreateCronTriggerDto = {
      name: 'Recordatorio diario',
      cronExpression: '0 9 * * *',
      triggerMessage: 'Hola',
      workflowId: 'wf-1',
    };

    // Fail-fast de UX: la barrera real está en WorkflowsService.execute()/executeStream()
    // (allowInternal), pero rechazar aquí evita crear un trigger que jamás podrá disparar
    // sobre un workflow interno de super admin.
    it('rechaza un workflow interno (isInternal: true)', async () => {
      mockPrismaService.workflow.findFirst.mockResolvedValue(null); // simula el filtro isInternal:false sin match

      await expect(service.create('org-1', dto)).rejects.toThrow(NotFoundException);

      expect(mockPrismaService.workflow.findFirst).toHaveBeenCalledWith({
        where: { id: 'wf-1', organizationId: 'org-1', deletedAt: null, isInternal: false },
      });
    });

    it('crea el trigger cuando el workflow no es interno', async () => {
      mockPrismaService.workflow.findFirst.mockResolvedValue({ id: 'wf-1' });
      // isActive: false — evita que create() arranque un CronJob real de fondo
      // (this.scheduleTrigger); no es lo que este test verifica.
      mockPrismaService.workflowCronTrigger.create.mockResolvedValue({
        id: 'trigger-1',
        isActive: false,
        cronExpression: dto.cronExpression,
      });

      const result = await service.create('org-1', dto);

      expect(result.id).toBe('trigger-1');
      expect(mockSchedulerRegistry.addCronJob).not.toHaveBeenCalled();
    });
  });
});
