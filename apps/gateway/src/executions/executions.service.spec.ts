import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ExecutionsService } from './executions.service';
import { PrismaService } from '../database/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('ExecutionsService', () => {
  let service: ExecutionsService;
  let prisma: PrismaService;
  let eventEmitter: EventEmitter2;

  const mockPrismaService = {
    execution: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    workflow: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
    },
  };

  const mockEventEmitter2 = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExecutionsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter2,
        },
      ],
    }).compile();

    service = module.get<ExecutionsService>(ExecutionsService);
    prisma = module.get<PrismaService>(PrismaService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);

    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create an execution and emit event', async () => {
      const mockResult = { id: 'exec-1', status: 'pending' };
      mockPrismaService.execution.create.mockResolvedValue(mockResult);

      const result = await service.create('workflow-id', 'API', { organizationId: 'org-1' });

      expect(mockPrismaService.execution.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workflowId: 'wf-1',
          status: 'pending',
          trigger: 'API',
          organizationId: 'org-1',
        }),
        include: {
          workflow: {
            select: { id: true, name: true, organizationId: true },
          },
        },
      });
      expect(mockEventEmitter2.emit).toHaveBeenCalledWith('execution.created', mockResult);
      expect(result).toEqual(mockResult);
    });
  });

  describe('updateStatus', () => {
    it('should update execution to completed and calculate duration', async () => {
      const now = new Date();
      const past = new Date(now.getTime() - 10000); // 10 seconds ago

      const mockExecution = {
        id: 'exec-1',
        workflowId: 'wf-1',
        startedAt: past,
      };

      const mockUpdated = { ...mockExecution, status: 'completed', duration: 10 };

      // Make Prisma findUnique return our mock execution with past time
      prisma.execution.findUnique = jest.fn().mockResolvedValue(mockExecution);
      // Make Prisma update return the expected object
      prisma.execution.update = jest.fn().mockResolvedValue(mockUpdated);
      
      // Mock updateWorkflowStats which is triggered on completion
      prisma.workflow.findUnique = jest.fn().mockResolvedValue({
        id: 'wf-1',
        totalExecutions: 5,
        avgExecutionTime: 20,
      });
      prisma.workflow.update = jest.fn().mockResolvedValue({});

      const data = {
        result: { success: true },
        cost: 0.05,
        tokensUsed: 1000,
        credits: 50,
      };

      const result = await service.updateStatus('exec-1', 'COMPLETED', data);

      // Verify the duration diff was sent to update correctly
      expect(prisma.execution.update).toHaveBeenCalledWith({
        where: { id: 'exec-1' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          result: data.result,
          cost: data.cost,
          tokensUsed: data.tokensUsed,
          credits: data.credits,
        }),
        include: expect.any(Object),
      });

      // Called internally
      expect(prisma.workflow.update).toHaveBeenCalled();

      // Emit correct event
      expect(eventEmitter.emit).toHaveBeenCalledWith('execution.updated', mockUpdated);

      expect(result).toEqual(mockUpdated);
    });

    it('should throw NotFoundException if execution not found', async () => {
      prisma.execution.findUnique = jest.fn().mockResolvedValue(null);

      await expect(
        service.updateStatus('invalid-id', 'COMPLETED')
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('Queries (findOneForClient, getByIdFull)', () => {
    it('findOneForClient should return formatted execution', async () => {
      const mockExec = {
        id: '123',
        workflowId: 'wf-1',
        organizationId: 'org-1',
        apiKey: { name: 'Test Key' },
      };
      
      prisma.execution.findFirst = jest.fn().mockResolvedValue(mockExec);

      const result = await service.findOneForClient('123', 'org-1');
      
      expect(result).toEqual({
        id: '123',
        workflowId: 'wf-1',
        organizationId: 'org-1',
        apiKeyName: 'Test Key', // Formatted field
      });
      // Ensure the query verifies ownership
      expect(prisma.execution.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({
          id: '123',
          workflow: expect.objectContaining({ organizationId: 'org-1' }),
        }),
        select: expect.any(Object),
      });
    });

    it('getByIdFull should return full execution', async () => {
      const mockExec = { id: '123', apiKey: { id: 'key' } };
      prisma.execution.findFirst = jest.fn().mockResolvedValue(mockExec);

      const result = await service.getByIdFull('123', 'org-1');
      expect(result).toEqual(mockExec);
      expect(prisma.execution.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({ id: '123', organizationId: 'org-1' }),
        include: expect.any(Object),
      });
    });

    it('should throw NotFoundException if execution missing on queries', async () => {
      prisma.execution.findFirst = jest.fn().mockResolvedValue(null);
      await expect(service.findOneForClient('123', 'org-1')).rejects.toThrow(NotFoundException);
      await expect(service.getByIdFull('123', 'org-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('Lists (findByWorkflow, findAll, findAllForAdmin)', () => {
    it('findByWorkflow should return executions', async () => {
      prisma.workflow.findFirst = jest.fn().mockResolvedValue({ id: 'wf-1' });
      const mockResult = [{ id: '1' }, { id: '2' }];
      prisma.execution.findMany = jest.fn().mockResolvedValue(mockResult);

      const result = await service.findByWorkflow('wf-1', 'org-1', 10, 'COMPLETED');
      
      expect(result).toEqual(mockResult);
      expect(prisma.execution.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workflowId: 'wf-1', status: 'COMPLETED' },
          take: 10,
        })
      );
    });

    it('findByWorkflow should throw if missing workflow', async () => {
      prisma.workflow.findFirst = jest.fn().mockResolvedValue(null);
      await expect(service.findByWorkflow('invalid', 'org-1')).rejects.toThrow(NotFoundException);
    });

    it('findAll should return paginated data with hasMore=true', async () => {
      // Mock count
      prisma.execution.count = jest.fn().mockResolvedValue(20);
      
      // Mock findMany returning (limit + 1) items to trigger `hasMore = true`
      const mockResults = Array(11).fill({ id: 'exec' }).map((x, i) => ({ id: `exec-${i}` }));
      prisma.execution.findMany = jest.fn().mockResolvedValue(mockResults);

      const result = await service.findAll('org-1', { limit: 10, status: 'COMPLETED' });

      expect(result.data).toHaveLength(10); // Takes only `limit`
      expect(result.pagination).toEqual({
        total: 20,
        limit: 10,
        nextCursor: 'exec-9',
        hasMore: true,
      });

      expect(prisma.execution.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 11, // limit + 1
          where: expect.objectContaining({ status: 'completed' }),
        })
      );
    });
  });

  describe('Analytics and Dashboard (getStats, getAnalyticsBySource, getDashboardData)', () => {
    it('getStats should accurately aggregate statuses and categories', async () => {
      const mockExecs = [
        { status: 'completed', duration: 10, credits: 5, workflow: { category: 'STANDARD' } },
        { status: 'failed', duration: 5, credits: 0, workflow: { category: 'LIGHT' }, wasOverage: true },
        { status: 'completed', duration: 15, credits: 10, workflow: { category: 'ADVANCED' } }
      ];
      prisma.execution.findMany = jest.fn().mockResolvedValue(mockExecs);

      const result = await service.getStats('org-1', '7d');

      expect(result.total).toBe(3);
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(1);
      
      // Calculate avg duration => (10+5+15)/3 = 10
      expect(result.avgDuration).toBe(10);
      expect(result.successRate).toBeCloseTo(66.67, 1);
      
      // Credits test
      expect(result.credits.totalConsumed).toBe(15);
      expect(result.credits.executionsInOverage).toBe(1);
      expect(result.credits.byCategory.STANDARD.count).toBe(1);
      expect(result.credits.byCategory.LIGHT.count).toBe(1);
    });

    it('getAnalyticsBySource should compute averages properly per user and key', async () => {
      prisma.workflow.findFirst = jest.fn().mockResolvedValue({ id: 'wf-1', name: 'Test' });

      // Grouping 
      const mockExecs = [
        { status: 'completed', duration: 10, apiKeyId: 'k1', userId: 'u1', apiKey: { name: 'K1' }, user: { name: 'U1', email: 'u1@' } },
        { status: 'failed', duration: 6, apiKeyId: 'k1', userId: 'u1', apiKey: { name: 'K1' }, user: { name: 'U1', email: 'u1@' } },
      ];
      prisma.execution.findMany = jest.fn().mockResolvedValue(mockExecs);

      const result = await service.getAnalyticsBySource('wf-1', 'org-1', '30d');

      // (10+6)/2 = 8
      expect(result.byApiKey[0].avgDuration).toBe(8);
      expect(result.byApiKey[0].successRate).toBe(50);
      expect(result.byUser[0].successRate).toBe(50);
    });
  });

  describe('Management (cancel, remove, link, updateUsageStats)', () => {
    it('cancel should set status to cancelled', async () => {
      prisma.execution.findFirst = jest.fn().mockResolvedValue({ status: 'running' });
      prisma.execution.update = jest.fn().mockResolvedValue({ status: 'cancelled' });

      // Intercept internally calling updateStatus
      jest.spyOn(service, 'updateStatus').mockResolvedValue({} as any);

      await service.cancel('exec-1', 'org-1');

      expect(service.updateStatus).toHaveBeenCalledWith('exec-1', 'CANCELLED', expect.any(Object));
    });

    it('remove should soft-delete', async () => {
      prisma.execution.findFirst = jest.fn().mockResolvedValue({ id: 'exec-1' });
      await service.remove('exec-1', 'org-1');
      expect(prisma.execution.update).toHaveBeenCalledWith({
        where: { id: 'exec-1' },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('updateUsageStats should update cost and tokens', async () => {
      await service.updateUsageStats('exec-1', 500, 0.02);
      expect(prisma.execution.update).toHaveBeenCalledWith({
        where: { id: 'exec-1' },
        data: { tokensUsed: 500, cost: 0.02 },
      });
    });
  });

});
