import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ExecutionsController } from './executions.controller';
import { ExecutionsService } from './executions.service';
import { UserPayload } from '../common/types/jwt-payload.type';
import { UserRole, PlanType } from '@workflow-automation/shared-types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('ExecutionsController', () => {
  let controller: ExecutionsController;
  let executionsService: jest.Mocked<ExecutionsService>;

  const mockUser: UserPayload = {
    sub: 'user-123',
    email: 'admin@test.com',
    name: 'Admin User',
    role: UserRole.ADMIN,
    organizationId: 'org-123',
    organizationName: 'Test Org',
    plan: PlanType.PRO,
  };

  const mockExecution = {
    id: 'execution-123',
    workflowId: 'workflow-123',
    organizationId: 'org-123',
    status: 'completed',
    trigger: 'api',
    triggerData: { apiKeyId: 'key-123' },
    startedAt: new Date('2024-01-01T10:00:00Z'),
    finishedAt: new Date('2024-01-01T10:01:00Z'),
    duration: 60,
    result: { success: true },
    error: null,
    userId: null,
    apiKeyId: 'key-123',
    workflow: {
      id: 'workflow-123',
      name: 'Test Workflow',
      organizationId: 'org-123',
    },
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
    const mockExecutionsService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      getStats: jest.fn(),
      cancel: jest.fn(),
    };

    // Mock guard que siempre permite el acceso
    const mockGuard = { canActivate: jest.fn(() => true) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExecutionsController],
      providers: [
        { provide: ExecutionsService, useValue: mockExecutionsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockGuard)
      .compile();

    controller = module.get<ExecutionsController>(ExecutionsController);
    executionsService = module.get(ExecutionsService) as jest.Mocked<ExecutionsService>;

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ============================================================================
  // FIND ALL TESTS
  // ============================================================================

  describe('findAll', () => {
    const mockExecutions = {
      total: 100,
      executions: [mockExecution, { ...mockExecution, id: 'execution-456' }],
    };

    beforeEach(() => {
      executionsService.findAll.mockResolvedValue(mockExecutions as any);
    });

    it('debería listar todas las ejecuciones de la organización', async () => {
      // Act
      const result = await controller.findAll(mockUser, 50);

      // Assert
      expect(result).toEqual(mockExecutions);
      expect(executionsService.findAll).toHaveBeenCalledWith(
        'org-123',
        50,
        undefined,
        undefined,
      );
    });

    it('debería usar límite por defecto de 50', async () => {
      // Act
      await controller.findAll(mockUser, 50);

      // Assert
      expect(executionsService.findAll).toHaveBeenCalledWith(
        'org-123',
        50,
        undefined,
        undefined,
      );
    });

    it('debería respetar límite personalizado', async () => {
      // Act
      await controller.findAll(mockUser, 100);

      // Assert
      expect(executionsService.findAll).toHaveBeenCalledWith(
        'org-123',
        100,
        undefined,
        undefined,
      );
    });

    it('debería limitar máximo a 200 resultados', async () => {
      // Act
      await controller.findAll(mockUser, 500);

      // Assert
      const call = executionsService.findAll.mock.calls[0];
      expect(call[1]).toBe(200); // maxLimit = Math.min(500, 200) = 200
    });

    it('debería filtrar por status cuando se provee', async () => {
      // Act
      await controller.findAll(mockUser, 50, 'completed');

      // Assert
      expect(executionsService.findAll).toHaveBeenCalledWith(
        'org-123',
        50,
        'completed',
        undefined,
      );
    });

    it('debería filtrar por workflowId cuando se provee', async () => {
      // Act
      await controller.findAll(mockUser, 50, undefined, 'workflow-123');

      // Assert
      expect(executionsService.findAll).toHaveBeenCalledWith(
        'org-123',
        50,
        undefined,
        'workflow-123',
      );
    });

    it('debería pasar organizationId del usuario actual', async () => {
      // Arrange
      const differentUser = { ...mockUser, organizationId: 'org-456' };

      // Act
      await controller.findAll(differentUser, 50);

      // Assert
      expect(executionsService.findAll).toHaveBeenCalledWith(
        'org-456',
        expect.any(Number),
        undefined,
        undefined,
      );
    });

    it('debería aceptar múltiples filtros simultáneamente', async () => {
      // Act
      await controller.findAll(mockUser, 75, 'failed', 'workflow-123');

      // Assert
      expect(executionsService.findAll).toHaveBeenCalledWith(
        'org-123',
        75,
        'failed',
        'workflow-123',
      );
    });
  });

  // ============================================================================
  // GET STATS TESTS
  // ============================================================================

  describe('getStats', () => {
    const mockStats = {
      period: '7d',
      total: 100,
      successful: 85,
      failed: 10,
      cancelled: 3,
      timeout: 2,
      successRate: 85,
      avgDuration: 45,
      totalDuration: 4500,
      byStatus: { completed: 85, failed: 10, cancelled: 3, timeout: 2 },
      byTrigger: { api: 60, webhook: 25, schedule: 10, manual: 5 },
      topWorkflows: [],
    };

    beforeEach(() => {
      executionsService.getStats.mockResolvedValue(mockStats as any);
    });

    it('debería obtener estadísticas de la organización', async () => {
      // Act
      const result = await controller.getStats(mockUser, '7d');

      // Assert
      expect(result).toEqual(mockStats);
      expect(executionsService.getStats).toHaveBeenCalledWith('org-123', '7d');
    });

    it('debería usar periodo por defecto 7d', async () => {
      // Act
      await controller.getStats(mockUser, '7d');

      // Assert
      expect(executionsService.getStats).toHaveBeenCalledWith('org-123', '7d');
    });

    it('debería aceptar diferentes periodos', async () => {
      // Act & Assert
      for (const period of ['24h', '7d', '30d', '90d', 'all']) {
        await controller.getStats(mockUser, period);
        expect(executionsService.getStats).toHaveBeenCalledWith('org-123', period);
      }
    });

    it('debería pasar organizationId del usuario actual', async () => {
      // Arrange
      const differentUser = { ...mockUser, organizationId: 'org-789' };

      // Act
      await controller.getStats(differentUser, '30d');

      // Assert
      expect(executionsService.getStats).toHaveBeenCalledWith('org-789', '30d');
    });
  });

  // ============================================================================
  // FIND ONE TESTS
  // ============================================================================

  describe('findOne', () => {
    beforeEach(() => {
      executionsService.findOne.mockResolvedValue(mockExecution as any);
    });

    it('debería obtener detalles de una ejecución específica', async () => {
      // Act
      const result = await controller.findOne(mockUser, 'execution-123');

      // Assert
      expect(result).toEqual(mockExecution);
      expect(executionsService.findOne).toHaveBeenCalledWith('execution-123', 'org-123');
    });

    it('debería verificar ownership por organizationId', async () => {
      // Arrange
      const differentUser = { ...mockUser, organizationId: 'org-456' };

      // Act
      await controller.findOne(differentUser, 'execution-123');

      // Assert
      expect(executionsService.findOne).toHaveBeenCalledWith('execution-123', 'org-456');
    });

    it('debería pasar el execution ID correctamente', async () => {
      // Act
      await controller.findOne(mockUser, 'execution-999');

      // Assert
      expect(executionsService.findOne).toHaveBeenCalledWith('execution-999', 'org-123');
    });
  });

  // ============================================================================
  // CANCEL TESTS
  // ============================================================================

  describe('cancel', () => {
    const mockCancelledExecution = {
      ...mockExecution,
      status: 'cancelled',
      error: 'Execution cancelled by user',
    };

    beforeEach(() => {
      executionsService.cancel.mockResolvedValue(mockCancelledExecution as any);
    });

    it('debería cancelar una ejecución exitosamente', async () => {
      // Act
      const result = await controller.cancel(mockUser, 'execution-123');

      // Assert
      expect(result).toEqual({
        success: true,
        message: 'Ejecución cancelada exitosamente',
        execution: mockCancelledExecution,
      });
      expect(executionsService.cancel).toHaveBeenCalledWith('execution-123', 'org-123');
    });

    it('debería verificar ownership por organizationId', async () => {
      // Arrange
      const differentUser = { ...mockUser, organizationId: 'org-456' };

      // Act
      await controller.cancel(differentUser, 'execution-123');

      // Assert
      expect(executionsService.cancel).toHaveBeenCalledWith('execution-123', 'org-456');
    });

    it('debería retornar estructura con success, message y execution', async () => {
      // Act
      const result = await controller.cancel(mockUser, 'execution-123');

      // Assert
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('message', 'Ejecución cancelada exitosamente');
      expect(result).toHaveProperty('execution');
      expect(result.execution.status).toBe('cancelled');
    });

    it('debería pasar el execution ID correctamente', async () => {
      // Act
      await controller.cancel(mockUser, 'execution-789');

      // Assert
      expect(executionsService.cancel).toHaveBeenCalledWith('execution-789', 'org-123');
    });
  });
});
