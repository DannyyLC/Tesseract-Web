import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowsService } from './workflows.service';
import { PrismaService } from '../database/prisma.service';
import { ExecutionsService } from '../executions/executions.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { AgentsService } from '../agents/agents.service';
import { CreditsService } from '../credits/credits.service';
import { LlmModelsService } from '../llm-models/llm-models.service';
import { ConversationsService } from '../conversations/conversations.service';
import { ToolsService } from '../tools/core/tools.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { InvalidWorkflowConfigException } from '../common/exceptions';
import { WorkflowCategory, SubscriptionPlan } from '@tesseract/types';

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
    calculateCostBatch: jest.fn().mockResolvedValue(0.15),
  };
  const mockConversationsService = {
    findOrCreateConversation: jest.fn(),
    getMessageHistory: jest.fn(),
    addMessage: jest.fn(),
    update: jest.fn(),
  };
  const mockToolsService = {
    findToolById: jest.fn(),
    populateDecryptedCredentials: jest.fn().mockResolvedValue({}),
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
      maxTokensPerExecution: 1000,
      config: { type: 'agent', graph: { type: 'react' }, agents: { agent1: { model: 'gpt-4o' } }, models: [{ name: 'gpt-4o' }] },
      isActive: true,
      tagIds: ['tag1'],
    };

    it('should create a workflow successfully', async () => {
      mockOrganizationsService.canAddWorkflow.mockResolvedValue(true);
      prisma.workflow.create = jest.fn().mockResolvedValue({ id: 'wf1', ...createDto });

      const result = await service.create(orgId, createDto as any);

      expect(organizationsService.canAddWorkflow).toHaveBeenCalledWith(orgId);
      expect(prisma.workflow.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          name: 'New Workflow',
          organizationId: orgId,
          tags: { connect: [{ id: 'tag1' }] },
        })
      }));
      expect(result.id).toBe('wf1');
    });

    it('should throw ForbiddenException if limit reached', async () => {
      mockOrganizationsService.canAddWorkflow.mockResolvedValue(false);
      prisma.organization.findUnique = jest.fn().mockResolvedValue({ plan: SubscriptionPlan.FREE });

      await expect(service.create(orgId, createDto as any)).rejects.toThrow(ForbiddenException);
      expect(prisma.workflow.create).not.toHaveBeenCalled();
    });

    it('should throw InvalidWorkflowConfigException if config is invalid', async () => {
      const invalidDto = { ...createDto, config: { models: 'not-an-array' } };
      await expect(service.create(orgId, invalidDto as any)).rejects.toThrow(InvalidWorkflowConfigException);
    });
  });

  describe('update', () => {
    const orgId = 'org1';
    const wfId = 'wf1';

    it('should update workflow successfully', async () => {
      prisma.workflow.findFirst = jest.fn().mockResolvedValue({ id: wfId, version: 1 });
      prisma.workflow.update = jest.fn().mockResolvedValue({ id: wfId, version: 2 });
      
      const updateDto = { name: 'Updated', config: { type: 'agent', graph: { type: 'react' }, agents: { agent1: { model: 'gpt-4o' } }, models: [{ name: 'gpt-4o' }] }, tagIds: ['tag2'] };
      const result = await service.update(orgId, wfId, updateDto as any);

      expect(prisma.workflow.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: wfId },
        data: expect.objectContaining({
          name: 'Updated',
          version: 2,
          tags: { set: [], connect: [{ id: 'tag2' }] }
        })
      }));
      expect(result.version).toBe(2);
    });

    it('should throw Error if config validation fails during update', async () => {
      prisma.workflow.findFirst = jest.fn().mockResolvedValue({ id: wfId, version: 1 });
      const updateDto = { config: { models: 'not-an-array' } };
      await expect(service.update(orgId, wfId, updateDto as any)).rejects.toThrow(InvalidWorkflowConfigException);
    });
  });

  describe('remove', () => {
    it('should soft delete workflow', async () => {
      prisma.workflow.findFirst = jest.fn().mockResolvedValue({ id: 'wf1' });
      prisma.workflow.update = jest.fn().mockResolvedValue({ id: 'wf1', isActive: false });

      const result = await service.remove('org1', 'wf1');

      expect(prisma.workflow.update).toHaveBeenCalledWith({
        where: { id: 'wf1' },
        data: { deletedAt: expect.any(Date), isActive: false }
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
      const mockWf = { id: 'wf1', name: 'Work 1' };
      prisma.workflow.findMany = jest.fn().mockResolvedValue([mockWf]);

      const result = await service.getDashboardData('org1', null, 10);

      expect(prisma.workflow.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org1', deletedAt: null }),
        take: 11
      }));
      expect(result.items).toHaveLength(1);
    });
  });

  describe('getStats', () => {
    it('should calculate global stats correctly', async () => {
      prisma.subscription.findFirst = jest.fn().mockResolvedValue({ currentPeriodStart: new Date('2023-01-01') });
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
        byCategory: { STANDARD: 10 }
    });
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
  });

  describe('getMetrics', () => {
    it('should throw Error if workflow not found', async () => {
      prisma.workflow.findFirst = jest.fn().mockResolvedValue(null);
      await expect(service.getMetrics('org1', 'wf1')).rejects.toThrow(NotFoundException);
    });

    it('should return metrics for 30d period', async () => {
      prisma.workflow.findFirst = jest.fn().mockResolvedValue({ id: 'wf1', createdAt: new Date('2023-01-01') });
      prisma.execution.aggregate = jest.fn().mockResolvedValue({ _count: { id: 10 }, _avg: { duration: 15.5 } });
      prisma.execution.groupBy = jest.fn().mockResolvedValue([{ status: 'completed', _count: 8 }, { status: 'failed', _count: 2 }]);
      prisma.$queryRawUnsafe = jest.fn().mockResolvedValue([
        { date: '2023-11-01', success: 1, failed: 0, count: 1 }
      ]);
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
      config: { type: 'agent', graph: { type: 'react' }, agents: { agent1: { model: 'gpt-4o' } }, models: [{ name: 'gpt-4o' }] },
    };

    it('should throw exceptions for inactive or paused workflows', async () => {
      prisma.workflow.findFirst = jest.fn().mockResolvedValue({ ...wfMock, isActive: false });
      await expect(service.execute(orgId, wfId, {})).rejects.toThrow();

      prisma.workflow.findFirst = jest.fn().mockResolvedValue({ ...wfMock, isPaused: true });
      await expect(service.execute(orgId, wfId, {})).rejects.toThrow();
    });

    it('should throw ForbiddenException if credits insufficient', async () => {
      prisma.workflow.findFirst = jest.fn().mockResolvedValue(wfMock);
      (mockCreditsService as any).canExecuteWorkflow = jest.fn().mockResolvedValue({ allowed: false, reason: 'No credits' });

      await expect(service.execute(orgId, wfId, {})).rejects.toThrow(ForbiddenException);
    });

    it('should execute workflow successfully via agentsService', async () => {
      prisma.workflow.findFirst = jest.fn().mockResolvedValue(wfMock);
      (mockCreditsService as any).canExecuteWorkflow = jest.fn().mockResolvedValue({ allowed: true });
      (mockExecutionsService as any).create = jest.fn().mockResolvedValue({ id: 'exec1' });
      (mockExecutionsService as any).linkToConversation = jest.fn();
      (mockExecutionsService as any).getByIdFull = jest.fn().mockResolvedValue({ id: 'exec1', status: 'completed' });
      (mockExecutionsService as any).updateStatus = jest.fn();
      (mockExecutionsService as any).updateUsageStats = jest.fn();
      (mockConversationsService as any).findOrCreateConversation = jest.fn().mockResolvedValue({ id: 'conv1', isHumanInTheLoop: false });
      (mockConversationsService as any).getMessageHistory = jest.fn().mockResolvedValue([]);
      (mockConversationsService as any).addMessage = jest.fn();
      
      (mockAgentsService as any).execute = jest.fn().mockResolvedValue({
        messages: [{ role: 'assistant', content: 'Success response' }],
        metadata: { total_tokens: 15, usage_by_model: { 'gpt-4o': 15 } }
      });
      (prisma as any).modelPrice = { findMany: jest.fn().mockResolvedValue([{ modelName: 'gpt-4o', tokenGenPriceBase: 0.01 }]) };

      const result = await service.execute(orgId, wfId, { message: 'Hello' });

      expect((mockAgentsService as any).execute).toHaveBeenCalled();
      expect((mockExecutionsService as any).updateStatus).toHaveBeenCalledWith('exec1', 'completed', expect.any(Object));
      expect(result.id).toBe('exec1');
    });
  });

});
});
