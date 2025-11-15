import { Test, TestingModule } from '@nestjs/testing';
import { Logger, NotFoundException } from '@nestjs/common';
import { ExecutionsService } from './executions.service';
import { PrismaService } from '../database/prisma.service';

describe('ExecutionsService', () => {
  let service: ExecutionsService;
  let prismaService: jest.Mocked<PrismaService>;

  const mockExecution = {
    id: 'execution-123',
    workflowId: 'workflow-123',
    organizationId: 'org-123',
    status: 'pending',
    trigger: 'api',
    triggerData: { organizationId: 'org-123', apiKeyId: 'key-123' },
    startedAt: new Date('2024-01-01T10:00:00Z'),
    finishedAt: null,
    duration: null,
    result: null,
    error: null,
    errorStack: null,
    logs: null,
    stepResults: null,
    cost: null,
    credits: null,
    userId: null,
    apiKeyId: 'key-123',
    createdAt: new Date('2024-01-01T10:00:00Z'),
    updatedAt: new Date('2024-01-01T10:00:00Z'),
    workflow: {
      id: 'workflow-123',
      name: 'Test Workflow',
      organizationId: 'org-123',
    },
  };

  const mockWorkflow = {
    id: 'workflow-123',
    name: 'Test Workflow',
    organizationId: 'org-123',
    totalExecutions: 10,
    successfulExecutions: 8,
    failedExecutions: 2,
    avgExecutionTime: 30,
    lastExecutedAt: new Date(),
  };

  // Silenciar logs durante los tests
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(async () => {
    const mockPrismaService = {
      execution: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
      },
      workflow: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExecutionsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ExecutionsService>(ExecutionsService);
    prismaService = module.get(PrismaService) as jest.Mocked<PrismaService>;

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================================================
  // CREATE TESTS
  // ============================================================================

  describe('create', () => {
    it('debería crear una ejecución exitosamente', async () => {
      // Arrange
      prismaService.execution.create.mockResolvedValue(mockExecution as any);

      // Act
      const result = await service.create('workflow-123', 'api', {
        organizationId: 'org-123',
        apiKeyId: 'key-123',
      });

      // Assert
      expect(result).toEqual(mockExecution);
      expect(prismaService.execution.create).toHaveBeenCalledWith({
        data: {
          workflowId: 'workflow-123',
          status: 'pending',
          trigger: 'api',
          triggerData: {
            organizationId: 'org-123',
            apiKeyId: 'key-123',
          },
          startedAt: expect.any(Date),
          organizationId: 'org-123',
          userId: undefined,
          apiKeyId: 'key-123',
        },
        include: {
          workflow: {
            select: {
              id: true,
              name: true,
              organizationId: true,
            },
          },
        },
      });
    });

    it('debería crear ejecución con userId cuando se provee', async () => {
      // Arrange
      prismaService.execution.create.mockResolvedValue(mockExecution as any);

      // Act
      await service.create('workflow-123', 'manual', {
        organizationId: 'org-123',
        userId: 'user-123',
      });

      // Assert
      const call = prismaService.execution.create.mock.calls[0][0];
      expect(call.data.userId).toBe('user-123');
    });

    it('debería crear ejecución sin triggerData', async () => {
      // Arrange
      prismaService.execution.create.mockResolvedValue(mockExecution as any);

      // Act
      await service.create('workflow-123', 'schedule');

      // Assert
      const call = prismaService.execution.create.mock.calls[0][0];
      expect(call.data.triggerData).toEqual({});
      expect(call.data.organizationId).toBeUndefined();
    });

    it('debería aceptar diferentes tipos de trigger', async () => {
      // Arrange
      prismaService.execution.create.mockResolvedValue(mockExecution as any);

      // Act & Assert
      for (const trigger of ['api', 'webhook', 'schedule', 'manual'] as const) {
        await service.create('workflow-123', trigger, { organizationId: 'org-123' });
        const call = prismaService.execution.create.mock.calls[prismaService.execution.create.mock.calls.length - 1][0];
        expect(call.data.trigger).toBe(trigger);
      }
    });
  });

  // ============================================================================
  // UPDATE STATUS TESTS
  // ============================================================================

  describe('updateStatus', () => {
    const mockExecutionForUpdate = {
      id: 'execution-123',
      startedAt: new Date('2024-01-01T10:00:00Z'),
      workflowId: 'workflow-123',
    };

    beforeEach(() => {
      prismaService.execution.findUnique.mockResolvedValue(mockExecutionForUpdate as any);
      prismaService.execution.update.mockResolvedValue(mockExecution as any);
      prismaService.workflow.findUnique.mockResolvedValue(mockWorkflow as any);
      prismaService.workflow.update.mockResolvedValue(mockWorkflow as any);
    });

    it('debería actualizar el estado a running', async () => {
      // Act
      const result = await service.updateStatus('execution-123', 'running');

      // Assert
      expect(result).toEqual(mockExecution);
      expect(prismaService.execution.update).toHaveBeenCalledWith({
        where: { id: 'execution-123' },
        data: expect.objectContaining({
          status: 'running',
          finishedAt: undefined,
          duration: undefined,
        }),
      });
    });

    it('debería actualizar a completed y calcular duración', async () => {
      // Arrange
      const startTime = new Date('2024-01-01T10:00:00Z');

      prismaService.execution.findUnique.mockResolvedValue({
        id: 'execution-123',
        startedAt: startTime,
        workflowId: 'workflow-123',
      } as any);

      // Act
      await service.updateStatus('execution-123', 'completed', {
        result: { success: true },
      });

      // Assert
      expect(prismaService.execution.update).toHaveBeenCalledWith({
        where: { id: 'execution-123' },
        data: expect.objectContaining({
          status: 'completed',
          finishedAt: expect.any(Date),
          duration: expect.any(Number), // Duración calculada en tiempo de ejecución
          result: { success: true },
        }),
      });
    });

    it('debería actualizar estadísticas del workflow cuando status=completed', async () => {
      // Act
      await service.updateStatus('execution-123', 'completed');

      // Assert
      expect(prismaService.workflow.findUnique).toHaveBeenCalledWith({
        where: { id: 'workflow-123' },
        select: expect.any(Object),
      });
      expect(prismaService.workflow.update).toHaveBeenCalledWith({
        where: { id: 'workflow-123' },
        data: expect.objectContaining({
          totalExecutions: { increment: 1 },
          successfulExecutions: { increment: 1 },
          lastExecutedAt: expect.any(Date),
        }),
      });
    });

    it('debería actualizar estadísticas del workflow cuando status=failed', async () => {
      // Act
      await service.updateStatus('execution-123', 'failed', {
        error: 'Test error',
        errorStack: 'Stack trace',
      });

      // Assert
      expect(prismaService.workflow.update).toHaveBeenCalledWith({
        where: { id: 'workflow-123' },
        data: expect.objectContaining({
          totalExecutions: { increment: 1 },
          failedExecutions: { increment: 1 },
        }),
      });
    });

    it('NO debería actualizar estadísticas cuando status=running', async () => {
      // Act
      await service.updateStatus('execution-123', 'running');

      // Assert
      expect(prismaService.workflow.findUnique).not.toHaveBeenCalled();
      expect(prismaService.workflow.update).not.toHaveBeenCalled();
    });

    it('debería lanzar NotFoundException si la ejecución no existe', async () => {
      // Arrange
      prismaService.execution.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.updateStatus('invalid-id', 'completed')
      ).rejects.toThrow(NotFoundException);
    });

    it('debería guardar error y errorStack', async () => {
      // Act
      await service.updateStatus('execution-123', 'failed', {
        error: 'Connection timeout',
        errorStack: 'at line 42',
      });

      // Assert
      expect(prismaService.execution.update).toHaveBeenCalledWith({
        where: { id: 'execution-123' },
        data: expect.objectContaining({
          error: 'Connection timeout',
          errorStack: 'at line 42',
        }),
      });
    });

    it('debería guardar logs y stepResults', async () => {
      // Act
      await service.updateStatus('execution-123', 'completed', {
        logs: 'Log line 1\nLog line 2',
        stepResults: { step1: 'ok', step2: 'ok' },
      });

      // Assert
      expect(prismaService.execution.update).toHaveBeenCalledWith({
        where: { id: 'execution-123' },
        data: expect.objectContaining({
          logs: 'Log line 1\nLog line 2',
          stepResults: { step1: 'ok', step2: 'ok' },
        }),
      });
    });

    it('debería guardar cost y credits', async () => {
      // Act
      await service.updateStatus('execution-123', 'completed', {
        cost: 0.05,
        credits: 10,
      });

      // Assert
      expect(prismaService.execution.update).toHaveBeenCalledWith({
        where: { id: 'execution-123' },
        data: expect.objectContaining({
          cost: 0.05,
          credits: 10,
        }),
      });
    });

    it('debería manejar estado cancelled', async () => {
      // Act
      await service.updateStatus('execution-123', 'cancelled');

      // Assert
      expect(prismaService.execution.update).toHaveBeenCalledWith({
        where: { id: 'execution-123' },
        data: expect.objectContaining({
          status: 'cancelled',
          finishedAt: expect.any(Date),
          duration: expect.any(Number),
        }),
      });
    });

    it('debería manejar estado timeout', async () => {
      // Act
      await service.updateStatus('execution-123', 'timeout');

      // Assert
      expect(prismaService.execution.update).toHaveBeenCalledWith({
        where: { id: 'execution-123' },
        data: expect.objectContaining({
          status: 'timeout',
          finishedAt: expect.any(Date),
          duration: expect.any(Number),
        }),
      });
    });
  });

  // ============================================================================
  // FIND ONE TESTS
  // ============================================================================

  describe('findOne', () => {
    it('debería obtener una ejecución por ID', async () => {
      // Arrange
      prismaService.execution.findFirst.mockResolvedValue(mockExecution as any);

      // Act
      const result = await service.findOne('execution-123', 'org-123');

      // Assert
      expect(result).toEqual(mockExecution);
      expect(prismaService.execution.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'execution-123',
          workflow: {
            organizationId: 'org-123',
            deletedAt: null,
          },
        },
        include: expect.any(Object),
      });
    });

    it('debería verificar ownership por organizationId', async () => {
      // Arrange
      prismaService.execution.findFirst.mockResolvedValue(mockExecution as any);

      // Act
      await service.findOne('execution-123', 'org-456');

      // Assert
      const call = prismaService.execution.findFirst.mock.calls[0][0];
      expect(call.where.workflow.organizationId).toBe('org-456');
    });

    it('debería lanzar NotFoundException si no se encuentra', async () => {
      // Arrange
      prismaService.execution.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.findOne('invalid-id', 'org-123')
      ).rejects.toThrow(NotFoundException);
    });

    it('debería incluir workflow, user y apiKey en el resultado', async () => {
      // Arrange
      prismaService.execution.findFirst.mockResolvedValue(mockExecution as any);

      // Act
      await service.findOne('execution-123', 'org-123');

      // Assert
      const call = prismaService.execution.findFirst.mock.calls[0][0];
      expect(call.include.workflow).toBeDefined();
      expect(call.include.user).toBeDefined();
      expect(call.include.apiKey).toBeDefined();
    });
  });

  // ============================================================================
  // FIND BY WORKFLOW TESTS
  // ============================================================================

  describe('findByWorkflow', () => {
    const mockExecutions = [mockExecution, { ...mockExecution, id: 'execution-456' }];

    beforeEach(() => {
      prismaService.workflow.findFirst.mockResolvedValue(mockWorkflow as any);
      prismaService.execution.findMany.mockResolvedValue(mockExecutions as any);
    });

    it('debería listar ejecuciones de un workflow', async () => {
      // Act
      const result = await service.findByWorkflow('workflow-123', 'org-123');

      // Assert
      expect(result).toEqual(mockExecutions);
      expect(prismaService.workflow.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'workflow-123',
          organizationId: 'org-123',
          deletedAt: null,
        },
      });
      expect(prismaService.execution.findMany).toHaveBeenCalled();
    });

    it('debería respetar el límite especificado', async () => {
      // Act
      await service.findByWorkflow('workflow-123', 'org-123', 10);

      // Assert
      const call = prismaService.execution.findMany.mock.calls[0][0];
      expect(call.take).toBe(10);
    });

    it('debería usar límite por defecto de 50', async () => {
      // Act
      await service.findByWorkflow('workflow-123', 'org-123');

      // Assert
      const call = prismaService.execution.findMany.mock.calls[0][0];
      expect(call.take).toBe(50);
    });

    it('debería filtrar por status cuando se provee', async () => {
      // Act
      await service.findByWorkflow('workflow-123', 'org-123', 50, 'completed');

      // Assert
      const call = prismaService.execution.findMany.mock.calls[0][0];
      expect(call.where.status).toBe('completed');
    });

    it('NO debería incluir filtro de status si no se provee', async () => {
      // Act
      await service.findByWorkflow('workflow-123', 'org-123', 50);

      // Assert
      const call = prismaService.execution.findMany.mock.calls[0][0];
      expect(call.where.status).toBeUndefined();
    });

    it('debería lanzar NotFoundException si el workflow no existe', async () => {
      // Arrange
      prismaService.workflow.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.findByWorkflow('invalid-id', 'org-123')
      ).rejects.toThrow(NotFoundException);
    });

    it('debería ordenar por startedAt descendente', async () => {
      // Act
      await service.findByWorkflow('workflow-123', 'org-123');

      // Assert
      const call = prismaService.execution.findMany.mock.calls[0][0];
      expect(call.orderBy).toEqual({ startedAt: 'desc' });
    });
  });

  // ============================================================================
  // FIND ALL TESTS
  // ============================================================================

  describe('findAll', () => {
    const mockExecutions = [mockExecution, { ...mockExecution, id: 'execution-456' }];

    beforeEach(() => {
      prismaService.execution.count.mockResolvedValue(100);
      prismaService.execution.findMany.mockResolvedValue(mockExecutions as any);
    });

    it('debería listar todas las ejecuciones de una organización', async () => {
      // Act
      const result = await service.findAll('org-123');

      // Assert
      expect(result).toEqual({
        total: 100,
        executions: mockExecutions,
      });
      expect(prismaService.execution.count).toHaveBeenCalled();
      expect(prismaService.execution.findMany).toHaveBeenCalled();
    });

    it('debería filtrar por organizationId', async () => {
      // Act
      await service.findAll('org-123');

      // Assert
      const countCall = prismaService.execution.count.mock.calls[0][0];
      const findCall = prismaService.execution.findMany.mock.calls[0][0];
      // findAll filtra por organizationId a través de la relación workflow
      expect(countCall.where.workflow.organizationId).toBe('org-123');
      expect(findCall.where.workflow.organizationId).toBe('org-123');
    });

    it('debería respetar el límite especificado', async () => {
      // Act
      await service.findAll('org-123', 25);

      // Assert
      const call = prismaService.execution.findMany.mock.calls[0][0];
      expect(call.take).toBe(25);
    });

    it('debería filtrar por status cuando se provee', async () => {
      // Act
      await service.findAll('org-123', 50, 'failed');

      // Assert
      const countCall = prismaService.execution.count.mock.calls[0][0];
      const findCall = prismaService.execution.findMany.mock.calls[0][0];
      expect(countCall.where.status).toBe('failed');
      expect(findCall.where.status).toBe('failed');
    });

    it('debería filtrar por workflowId cuando se provee', async () => {
      // Act
      await service.findAll('org-123', 50, undefined, 'workflow-123');

      // Assert
      const countCall = prismaService.execution.count.mock.calls[0][0];
      const findCall = prismaService.execution.findMany.mock.calls[0][0];
      expect(countCall.where.workflowId).toBe('workflow-123');
      expect(findCall.where.workflowId).toBe('workflow-123');
    });

    it('debería ordenar por startedAt descendente', async () => {
      // Act
      await service.findAll('org-123');

      // Assert
      const call = prismaService.execution.findMany.mock.calls[0][0];
      expect(call.orderBy).toEqual({ startedAt: 'desc' });
    });
  });

  // ============================================================================
  // CANCEL TESTS
  // ============================================================================

  describe('cancel', () => {
    const mockPendingExecution = {
      ...mockExecution,
      status: 'pending',
      startedAt: new Date('2024-01-01T10:00:00Z'),
      workflowId: 'workflow-123',
    };

    beforeEach(() => {
      prismaService.execution.findFirst.mockResolvedValue(mockPendingExecution as any);
      // cancel() llama a updateStatus() internamente, que necesita findUnique
      prismaService.execution.findUnique.mockResolvedValue({
        id: 'execution-123',
        startedAt: mockPendingExecution.startedAt,
        workflowId: 'workflow-123',
      } as any);
      prismaService.execution.update.mockResolvedValue({
        ...mockPendingExecution,
        status: 'cancelled',
      } as any);
    });

    it('debería cancelar una ejecución pending', async () => {
      // Act
      const result = await service.cancel('execution-123', 'org-123');

      // Assert
      expect(result.status).toBe('cancelled');
      // cancel() llama a updateStatus() que incluye todos los campos
      expect(prismaService.execution.update).toHaveBeenCalledWith({
        where: { id: 'execution-123' },
        data: expect.objectContaining({
          status: 'cancelled',
          error: 'Execution cancelled by user',
          finishedAt: expect.any(Date),
          duration: expect.any(Number),
        }),
      });
    });

    it('debería verificar ownership por organizationId', async () => {
      // Act
      await service.cancel('execution-123', 'org-456');

      // Assert
      const call = prismaService.execution.findFirst.mock.calls[0][0];
      expect(call.where.workflow.organizationId).toBe('org-456');
    });

    it('debería lanzar NotFoundException si no se encuentra la ejecución', async () => {
      // Arrange
      prismaService.execution.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.cancel('invalid-id', 'org-123')
      ).rejects.toThrow(NotFoundException);
    });

    it('debería lanzar error si la ejecución ya terminó', async () => {
      // Arrange
      prismaService.execution.findFirst.mockResolvedValue({
        ...mockExecution,
        status: 'completed',
      } as any);

      // Act & Assert
      await expect(
        service.cancel('execution-123', 'org-123')
      ).rejects.toThrow('No se puede cancelar una ejecución con estado: completed');
    });

    it('debería permitir cancelar ejecución running', async () => {
      // Arrange
      prismaService.execution.findFirst.mockResolvedValue({
        ...mockExecution,
        status: 'running',
      } as any);

      // Act
      await service.cancel('execution-123', 'org-123');

      // Assert
      expect(prismaService.execution.update).toHaveBeenCalled();
    });
  });
});
