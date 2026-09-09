import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowsService } from './workflows.service';
import { WorkflowConfigValidator } from './workflow-config.validator';
import { DatasetTokenService } from '../datasets/core/dataset-token.service';
import { EndUsersService } from '@/identity/end-users/end-users.service';
import { PrismaService } from '@/platform/database/prisma.service';
import { ExecutionsService } from '@/automation/executions/executions.service';
import { OrganizationsService } from '@/identity/organizations/organizations.service';
import { AgentsService } from '../agents/agents.service';
import { CreditsService } from '@/billing/credits/credits.service';
import { LlmModelsService } from '@/automation/llm-models/llm-models.service';
import { ConversationsService } from '@/messaging/conversations/conversations.service';
import { ToolsService } from '../tools/core/tools.service';
import { MediaProcessingService } from '../media-processing/media-processing.service';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { InvalidWorkflowConfigException, WorkflowNotFoundException } from '@/platform/common/exceptions';
import { WorkflowCategory } from '@tesseract/types';

describe('WorkflowsService', () => {
  let service: WorkflowsService;
  let prisma: PrismaService;
  let organizationsService: OrganizationsService;

  const mockPrismaService = {
    workflow: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      update: jest.fn(),
    },
    subscription: {
      findFirst: jest.fn(),
    },
    execution: {
      count: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    creditTransaction: {
      aggregate: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
    },
    llmModel: {
      findMany: jest.fn().mockResolvedValue([{ modelName: 'gpt-4o' }]),
    },
    $queryRawUnsafe: jest.fn(),
  };

  const mockExecutionsService = {
    create: jest.fn(),
    linkToConversation: jest.fn(),
    getByIdFull: jest.fn(),
    updateStatus: jest.fn(),
    updateUsageStats: jest.fn(),
  };
  const mockOrganizationsService = {
    canAddWorkflow: jest.fn(),
    getWorkflowLimit: jest.fn(),
  };
  const mockAgentsService = {
    execute: jest.fn(),
  };
  const mockCreditsService = {
    canExecuteWorkflow: jest.fn(),
    deductCredits: jest.fn(),
  };
  const mockLlmModelsService = {
    getActiveModels: jest.fn().mockResolvedValue([{ name: 'gpt-4o' }]),
    // Devuelve un array (CostCalculation[]) como el servicio real; antes
    // devolvia un numero y el codigo logueaba "calculations is not iterable".
    calculateCostBatch: jest.fn().mockResolvedValue([]),
  };
  const mockConversationsService = {
    findOrCreateConversation: jest.fn(),
    findOrCreateConversationFromWhatsAppMessage: jest.fn(),
    getMessageHistory: jest.fn(),
    getMessageHistoryWithIds: jest.fn().mockResolvedValue([]),
    addMessage: jest.fn(),
    update: jest.fn(),
    requestHumanIntervention: jest.fn(),
    tryAcquireCompactionLock: jest.fn().mockResolvedValue(false),
    releaseCompactionLock: jest.fn(),
    getActiveCompactionSummary: jest.fn().mockResolvedValue(null),
    getActiveCompaction: jest.fn().mockResolvedValue(null),
    createAndActivateCompaction: jest.fn(),
  };
  const mockToolsService = {
    findToolById: jest.fn(),
    populateDecryptedCredentials: jest.fn().mockResolvedValue({}),
  };

  const mockMediaProcessingService = {
    processIncomingAttachments: jest.fn().mockResolvedValue({ attachments: [], derivedText: null }),
  };

  const mockConfigService = {
    get: jest.fn((_key: string, defaultValue?: string) => defaultValue),
  };

  const mockDatasetTokenService = {
    sign: jest.fn().mockResolvedValue('dataset-token'),
  };

  // Por defecto nadie está bloqueado: la lista negra es la excepción, no el caso normal.
  const mockEndUsersService = {
    isBlockedById: jest.fn().mockResolvedValue(false),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ExecutionsService, useValue: mockExecutionsService },
        { provide: OrganizationsService, useValue: mockOrganizationsService },
        { provide: AgentsService, useValue: mockAgentsService },
        { provide: CreditsService, useValue: mockCreditsService },
        { provide: LlmModelsService, useValue: mockLlmModelsService },
        { provide: ConversationsService, useValue: mockConversationsService },
        { provide: ToolsService, useValue: mockToolsService },
        { provide: MediaProcessingService, useValue: mockMediaProcessingService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: DatasetTokenService, useValue: mockDatasetTokenService },
        { provide: EndUsersService, useValue: mockEndUsersService },
        // El validador real, no un mock: los tests de config de abajo existen para
        // ejercer esa lógica, y mockearla los dejaría sin verificar nada.
        WorkflowConfigValidator,
      ],
    }).compile();

    service = module.get<WorkflowsService>(WorkflowsService);
    prisma = module.get<PrismaService>(PrismaService);
    organizationsService = module.get<OrganizationsService>(OrganizationsService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const orgId = 'org1';
    const createDto = {
      name: 'New Workflow',
      description: 'Desc',
      category: WorkflowCategory.STANDARD,
      maxHistoryTokens: 1000,
      config: {
        type: 'agent',
        graph: { type: 'react' },
        agents: { agent1: { model: 'gpt-4o' } },
        models: [{ name: 'gpt-4o' }],
      },
      isActive: true,
      tagIds: ['tag1'],
    };

    it('should create a workflow successfully', async () => {
      mockOrganizationsService.canAddWorkflow.mockResolvedValue(true);
      prisma.workflow.create = jest.fn().mockResolvedValue({ id: 'wf1', ...createDto });

      const result = await service.create(orgId, createDto as any);

      expect(organizationsService.canAddWorkflow).toHaveBeenCalledWith(orgId);
      expect(prisma.workflow.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'New Workflow',
            organizationId: orgId,
            tags: { connect: [{ id: 'tag1' }] },
          }),
        }),
      );
      expect(result.id).toBe('wf1');
    });

    it('should throw ForbiddenException if limit reached', async () => {
      mockOrganizationsService.canAddWorkflow.mockResolvedValue(false);
      mockOrganizationsService.getWorkflowLimit.mockResolvedValue(5);

      await expect(service.create(orgId, createDto as any)).rejects.toThrow(ForbiddenException);
      expect(prisma.workflow.create).not.toHaveBeenCalled();
    });

    it('should throw InvalidWorkflowConfigException if config is invalid', async () => {
      const invalidDto = { ...createDto, config: { models: 'not-an-array' } };
      await expect(service.create(orgId, invalidDto as any)).rejects.toThrow(
        InvalidWorkflowConfigException,
      );
    });
  });

  describe('update', () => {
    const orgId = 'org1';
    const wfId = 'wf1';

    it('should update workflow successfully', async () => {
      prisma.workflow.findFirst = jest.fn().mockResolvedValue({ id: wfId, version: 1 });
      prisma.workflow.update = jest.fn().mockResolvedValue({ id: wfId, version: 2 });

      const updateDto = {
        name: 'Updated',
        config: {
          type: 'agent',
          graph: { type: 'react' },
          agents: { agent1: { model: 'gpt-4o' } },
          models: [{ name: 'gpt-4o' }],
        },
        tagIds: ['tag2'],
      };
      const result = await service.update(orgId, wfId, updateDto as any);

      expect(prisma.workflow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: wfId },
          data: expect.objectContaining({
            name: 'Updated',
            version: 2,
            tags: { set: [], connect: [{ id: 'tag2' }] },
          }),
        }),
      );
      expect(result.version).toBe(2);
    });

    it('should throw Error if config validation fails during update', async () => {
      prisma.workflow.findFirst = jest.fn().mockResolvedValue({ id: wfId, version: 1 });
      const updateDto = { config: { models: 'not-an-array' } };
      await expect(service.update(orgId, wfId, updateDto as any)).rejects.toThrow(
        InvalidWorkflowConfigException,
      );
    });
  });

  describe('remove', () => {
    it('should soft delete workflow', async () => {
      prisma.workflow.findFirst = jest.fn().mockResolvedValue({ id: 'wf1' });
      prisma.workflow.update = jest.fn().mockResolvedValue({ id: 'wf1', isActive: false });

      const result = await service.remove('org1', 'wf1');

      expect(prisma.workflow.update).toHaveBeenCalledWith({
        where: { id: 'wf1' },
        data: { deletedAt: expect.any(Date), isActive: false },
      });
      expect(result.message).toBe('Workflow eliminado exitosamente');
    });

    it('should throw NotFoundException if workflow does not exist', async () => {
      prisma.workflow.findFirst = jest.fn().mockResolvedValue(null);
      await expect(service.remove('org1', 'wf1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getDashboardData', () => {
    it('should return paginated items', async () => {
      const mockWf = { id: 'wf1', name: 'Work 1', category: 'STANDARD' };
      prisma.workflow.findMany = jest.fn().mockResolvedValue([mockWf]);

      const result = await service.getDashboardData('org1', null, 10);

      expect(prisma.workflow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org1', deletedAt: null }),
          take: 11,
        }),
      );
      expect(result.items).toHaveLength(1);
    });

    // Un workflow interno lo construye/prueba super admin dentro de la organización real
    // del cliente; no debe aparecer nunca en lo que el cliente ve.
    it('should exclude internal workflows', async () => {
      prisma.workflow.findMany = jest.fn().mockResolvedValue([]);

      await service.getDashboardData('org1', null, 10);

      expect(prisma.workflow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isInternal: false }),
        }),
      );
    });
  });

  describe('getStats', () => {
    it('should calculate global stats correctly', async () => {
      prisma.subscription.findFirst = jest
        .fn()
        .mockResolvedValue({ currentPeriodStart: new Date('2023-01-01') });
      prisma.workflow.count = jest.fn().mockResolvedValueOnce(10).mockResolvedValueOnce(5); // total, active
      prisma.execution.count = jest.fn().mockResolvedValue(100);
      prisma.creditTransaction.aggregate = jest.fn().mockResolvedValue({ _sum: { amount: -50.5 } });
      prisma.workflow.groupBy = jest.fn().mockResolvedValue([{ category: 'STANDARD', _count: 10 }]);

      const result = await service.getStats('org1');

      expect(result).toEqual({
        totalWorkflows: 10,
        activeWorkflows: 5,
        totalExecutionsMonth: 100,
        creditsConsumedMonth: 50.5,
        byCategory: { STANDARD: 10 },
      });

      // Los 4 conteos que puede ver el cliente (total, activos, ejecuciones del mes,
      // por categoría) excluyen workflows internos.
      expect(prisma.workflow.count).toHaveBeenNthCalledWith(1, {
        where: { organizationId: 'org1', deletedAt: null, isInternal: false },
      });
      expect(prisma.workflow.count).toHaveBeenNthCalledWith(2, {
        where: { organizationId: 'org1', deletedAt: null, isActive: true, isInternal: false },
      });
      expect(prisma.execution.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isInternalWorkflow: false }),
        }),
      );
      expect(prisma.workflow.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org1', deletedAt: null, isInternal: false },
        }),
      );
    });

    describe('findOne', () => {
      it('should return a workflow', async () => {
        const mockWf = { id: 'wf1', name: 'Work 1' };
        prisma.workflow.findFirst = jest.fn().mockResolvedValue(mockWf);

        const result = await service.findOne('org1', 'wf1');
        expect(result).toEqual(mockWf);
      });

      it('should throw NotFoundException if workflow not found', async () => {
        prisma.workflow.findFirst = jest.fn().mockResolvedValue(null);
        await expect(service.findOne('org1', 'wf1')).rejects.toThrow(NotFoundException);
      });

      it('should exclude internal workflows from the tenant lookup', async () => {
        prisma.workflow.findFirst = jest.fn().mockResolvedValue(null);

        await expect(service.findOne('org1', 'wf1')).rejects.toThrow(NotFoundException);
        expect(prisma.workflow.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ isInternal: false }),
          }),
        );
      });
    });

    describe('getMetrics', () => {
      it('should throw Error if workflow not found', async () => {
        prisma.workflow.findFirst = jest.fn().mockResolvedValue(null);
        await expect(service.getMetrics('org1', 'wf1')).rejects.toThrow(NotFoundException);
      });

      it('should return metrics for 30d period', async () => {
        prisma.workflow.findFirst = jest
          .fn()
          .mockResolvedValue({ id: 'wf1', createdAt: new Date('2023-01-01') });
        prisma.execution.aggregate = jest
          .fn()
          .mockResolvedValue({ _count: { id: 10 }, _avg: { duration: 15.5 } });
        prisma.execution.groupBy = jest.fn().mockResolvedValue([
          { status: 'COMPLETED', _count: 8 },
          { status: 'FAILED', _count: 2 },
        ]);
        prisma.$queryRawUnsafe = jest
          .fn()
          .mockResolvedValue([{ date: '2023-11-01', success: 1, failed: 0, count: 1 }]);
        prisma.execution.findMany = jest.fn().mockResolvedValue([{ error: 'Rate limit exceeded' }]);

        const result = await service.getMetrics('org1', 'wf1', '30d');

        expect(result.totalExecutions).toBe(10);
        expect(result.successRate).toBe(80);
        expect(result.avgDuration).toBe(15.5);
        expect(result.granularity).toBe('day');
        expect(result.errorDistribution).toEqual({ RATE_LIMIT: 1 });
      });
    });

    describe('execute', () => {
      const orgId = 'org1';
      const wfId = 'wf1';
      const wfMock = {
        id: wfId,
        isActive: true,
        isPaused: false,
        organizationId: orgId,
        category: WorkflowCategory.STANDARD,
        organization: { id: orgId, name: 'Org 1', plan: 'STANDARD' },
        tenantTools: [],
        config: {
          type: 'agent',
          graph: { type: 'react' },
          agents: { agent1: { model: 'gpt-4o' } },
          models: [{ name: 'gpt-4o' }],
        },
      };

      it('should throw exceptions for inactive or paused workflows', async () => {
        prisma.workflow.findFirst = jest.fn().mockResolvedValue({ ...wfMock, isActive: false });
        await expect(service.execute(orgId, wfId, {})).rejects.toThrow();

        prisma.workflow.findFirst = jest.fn().mockResolvedValue({ ...wfMock, isPaused: true });
        await expect(service.execute(orgId, wfId, {})).rejects.toThrow();
      });

      it('should throw ForbiddenException if credits insufficient', async () => {
        prisma.workflow.findFirst = jest.fn().mockResolvedValue(wfMock);
        (mockCreditsService as any).canExecuteWorkflow = jest
          .fn()
          .mockResolvedValue({ allowed: false, reason: 'No credits' });

        await expect(service.execute(orgId, wfId, {})).rejects.toThrow(ForbiddenException);
      });

      it('should execute workflow successfully via agentsService', async () => {
        prisma.workflow.findFirst = jest.fn().mockResolvedValue(wfMock);
        (mockCreditsService as any).canExecuteWorkflow = jest
          .fn()
          .mockResolvedValue({ allowed: true });
        (mockExecutionsService as any).create = jest.fn().mockResolvedValue({ id: 'exec1' });
        (mockExecutionsService as any).linkToConversation = jest.fn();
        (mockExecutionsService as any).getByIdFull = jest
          .fn()
          .mockResolvedValue({ id: 'exec1', status: 'completed' });
        (mockExecutionsService as any).updateStatus = jest.fn();
        (mockExecutionsService as any).updateUsageStats = jest.fn();
        (mockConversationsService as any).findOrCreateConversation = jest
          .fn()
          .mockResolvedValue({ id: 'conv1', isHumanInTheLoop: false });
        (mockConversationsService as any).getMessageHistory = jest.fn().mockResolvedValue([]);
        (mockConversationsService as any).addMessage = jest.fn();

        (mockAgentsService as any).execute = jest.fn().mockResolvedValue({
          messages: [{ role: 'assistant', content: 'Success response' }],
          metadata: { total_tokens: 15, usage_by_model: { 'gpt-4o': 15 } },
        });
        (prisma as any).modelPrice = {
          findMany: jest.fn().mockResolvedValue([{ modelName: 'gpt-4o', tokenGenPriceBase: 0.01 }]),
        };

        const result = await service.execute(orgId, wfId, { message: 'Hello' });

        expect((mockAgentsService as any).execute).toHaveBeenCalled();
        expect((mockExecutionsService as any).updateStatus).toHaveBeenCalledWith(
          'exec1',
          'COMPLETED',
          expect.any(Object),
        );
        expect(result.id).toBe('exec1');
      });

      it('marca el resultado con skipped:hitl cuando un humano atiende la conversación', async () => {
        // El worker de WhatsApp se apoya en esta marca para distinguir el silencio
        // deliberado de una ejecución que quedó vacía por un fallo. Sin ella volvería a
        // mandarle al cliente una disculpa inventada cada vez que escribe.
        prisma.workflow.findFirst = jest.fn().mockResolvedValue(wfMock);
        (mockCreditsService as any).canExecuteWorkflow = jest
          .fn()
          .mockResolvedValue({ allowed: true });
        (mockExecutionsService as any).create = jest.fn().mockResolvedValue({ id: 'exec1' });
        (mockExecutionsService as any).linkToConversation = jest.fn();
        (mockExecutionsService as any).getByIdFull = jest.fn().mockResolvedValue({ id: 'exec1' });
        (mockExecutionsService as any).updateStatus = jest.fn();
        (mockConversationsService as any).findOrCreateConversation = jest.fn().mockResolvedValue({
          id: 'conv1',
          isHumanInTheLoop: true,
          endUserId: 'end-user-1',
        });
        (mockConversationsService as any).addMessage = jest.fn();
        (mockConversationsService as any).update = jest.fn();
        (mockAgentsService as any).execute = jest.fn();

        await service.execute(orgId, wfId, { message: 'Hola, sigo esperando' });

        expect((mockAgentsService as any).execute).not.toHaveBeenCalled();
        expect((mockExecutionsService as any).updateStatus).toHaveBeenCalledWith(
          'exec1',
          'COMPLETED',
          expect.objectContaining({
            result: expect.objectContaining({ messages: [], skipped: 'hitl' }),
          }),
        );
      });

      it('salta el chequeo y el descuento de créditos para un workflow interno (allowInternal:true)', async () => {
        prisma.workflow.findFirst = jest.fn().mockResolvedValue({ ...wfMock, isInternal: true });
        (mockExecutionsService as any).create = jest.fn().mockResolvedValue({ id: 'exec1' });
        (mockExecutionsService as any).linkToConversation = jest.fn();
        (mockExecutionsService as any).getByIdFull = jest
          .fn()
          .mockResolvedValue({ id: 'exec1', status: 'completed' });
        (mockExecutionsService as any).updateStatus = jest.fn();
        (mockConversationsService as any).findOrCreateConversation = jest
          .fn()
          .mockResolvedValue({ id: 'conv1', isHumanInTheLoop: false });
        (mockConversationsService as any).getMessageHistory = jest.fn().mockResolvedValue([]);
        (mockConversationsService as any).addMessage = jest.fn();
        (mockAgentsService as any).execute = jest.fn().mockResolvedValue({
          messages: [{ role: 'assistant', content: 'Success response' }],
          metadata: { total_tokens: 15, usage_by_model: { 'gpt-4o': 15 } },
        });
        (prisma as any).modelPrice = {
          findMany: jest.fn().mockResolvedValue([{ modelName: 'gpt-4o', tokenGenPriceBase: 0.01 }]),
        };

        const result = await service.execute(
          orgId,
          wfId,
          { message: 'Hello' },
          undefined, // metadata
          undefined, // userId
          undefined, // whatsappData
          undefined, // apiKeyId
          undefined, // trigger
          undefined, // executionId
          true, // allowInternal: es el escenario que prueba este test (test-execute de admin)
        );

        expect((mockCreditsService as any).canExecuteWorkflow).not.toHaveBeenCalled();
        expect((mockCreditsService as any).deductCredits).not.toHaveBeenCalled();
        expect((mockExecutionsService as any).create).toHaveBeenCalledWith(
          wfId,
          expect.anything(),
          expect.anything(),
          undefined,
          true, // isInternalWorkflow congelado desde workflow.isInternal
        );
        expect(result.id).toBe('exec1');
      });

      it('rechaza un workflow interno sin allowInternal (el cliente nunca lo ejecuta)', async () => {
        prisma.workflow.findFirst = jest.fn().mockResolvedValue({ ...wfMock, isInternal: true });
        (mockExecutionsService as any).create = jest.fn();

        await expect(service.execute(orgId, wfId, { message: 'Hello' })).rejects.toThrow(
          WorkflowNotFoundException,
        );
        expect((mockExecutionsService as any).create).not.toHaveBeenCalled();
      });

      it('rechaza igual con allowInternal:false explícito', async () => {
        prisma.workflow.findFirst = jest.fn().mockResolvedValue({ ...wfMock, isInternal: true });
        (mockExecutionsService as any).create = jest.fn();

        await expect(
          service.execute(
            orgId,
            wfId,
            { message: 'Hello' },
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            false,
          ),
        ).rejects.toThrow(WorkflowNotFoundException);
        expect((mockExecutionsService as any).create).not.toHaveBeenCalled();
      });
    });

    describe('executeStream', () => {
      const orgId = 'org1';
      const wfId = 'wf1';
      const wfMock = {
        id: wfId,
        isActive: true,
        isPaused: false,
        organizationId: orgId,
        category: WorkflowCategory.STANDARD,
        organization: { id: orgId, name: 'Org 1', plan: 'STANDARD' },
        tenantTools: [],
        config: {
          type: 'agent',
          graph: { type: 'react' },
          agents: { agent1: { model: 'gpt-4o' } },
          models: [{ name: 'gpt-4o' }],
        },
      };

      it('rechaza un workflow interno sin allowInternal (el cliente nunca lo ejecuta)', async () => {
        prisma.workflow.findFirst = jest.fn().mockResolvedValue({ ...wfMock, isInternal: true });
        (mockExecutionsService as any).create = jest.fn();

        await expect(service.executeStream(orgId, wfId, { message: 'Hello' })).rejects.toThrow(
          WorkflowNotFoundException,
        );
        expect((mockExecutionsService as any).create).not.toHaveBeenCalled();
      });

      it('con allowInternal:true pasa el gate, salta créditos y congela isInternalWorkflow', async () => {
        prisma.workflow.findFirst = jest.fn().mockResolvedValue({ ...wfMock, isInternal: true });
        // No hace falta mockear todo el pipeline de streaming: basta con que
        // executionsService.create reciba la llamada (prueba que pasó el gate y el
        // chequeo de créditos) y cortar ahí con un rechazo distintivo.
        const sentinel = new Error('sentinel: llegó a crear la ejecución');
        (mockExecutionsService as any).create = jest.fn().mockRejectedValue(sentinel);

        await expect(
          service.executeStream(
            orgId,
            wfId,
            { message: 'Hello' },
            undefined, // metadata
            undefined, // userId
            undefined, // apiKeyId
            undefined, // trigger
            undefined, // executionId
            true, // allowInternal: es el escenario que prueba este test (test-execute de admin)
          ),
        ).rejects.toThrow(sentinel);

        expect((mockCreditsService as any).canExecuteWorkflow).not.toHaveBeenCalled();
        expect((mockExecutionsService as any).create).toHaveBeenCalledWith(
          wfId,
          expect.anything(),
          expect.anything(),
          undefined,
          true, // isInternalWorkflow congelado desde workflow.isInternal
        );
      });
    });
  });

  describe('assertInternalForTesting', () => {
    const orgId = 'org1';
    const wfId = 'wf1';

    it('no lanza si el workflow es interno', async () => {
      prisma.workflow.findFirst = jest.fn().mockResolvedValue({ isInternal: true });
      await expect(service.assertInternalForTesting(orgId, wfId)).resolves.toBeUndefined();
    });

    it('rechaza un workflow publicado (isInternal: false)', async () => {
      prisma.workflow.findFirst = jest.fn().mockResolvedValue({ isInternal: false });
      await expect(service.assertInternalForTesting(orgId, wfId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('lanza NotFound si el workflow no existe en esa organización', async () => {
      prisma.workflow.findFirst = jest.fn().mockResolvedValue(null);
      await expect(service.assertInternalForTesting(orgId, wfId)).rejects.toThrow();
    });
  });
});
