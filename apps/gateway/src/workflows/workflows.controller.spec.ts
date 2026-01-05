import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { ExecutionsService } from '../executions/executions.service';
import { UserPayload } from '../common/types/jwt-payload.type';
import { ApiKeyPayload } from '../common/types/api-key-payload.type';
import { UserRole, PlanType } from '@workflow-automation/shared-types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';

describe('WorkflowsController', () => {
  let controller: WorkflowsController;
  let workflowsService: jest.Mocked<WorkflowsService>;
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

  const mockApiKey: ApiKeyPayload = {
    apiKeyId: 'key-123',
    organizationId: 'org-123',
    apiKeyName: 'Test API Key',
    organizationName: 'Test Org',
    plan: 'PRO',
  };

  const mockWorkflow = {
    id: 'workflow-123',
    name: 'Test Workflow',
    description: 'A test workflow',
    isActive: true,
    triggerType: 'api',
    steps: [],
    organizationId: 'org-123',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
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
    const mockWorkflowsService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      execute: jest.fn(),
    };

    const mockExecutionsService = {
      getAnalyticsBySource: jest.fn(),
    };

    // Mock guard que siempre permite el acceso
    const mockGuard = { canActivate: jest.fn(() => true) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkflowsController],
      providers: [
        { provide: WorkflowsService, useValue: mockWorkflowsService },
        { provide: ExecutionsService, useValue: mockExecutionsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockGuard)
      .overrideGuard(RolesGuard)
      .useValue(mockGuard)
      .overrideGuard(ApiKeyGuard)
      .useValue(mockGuard)
      .compile();

    controller = module.get<WorkflowsController>(WorkflowsController);
    workflowsService = module.get(WorkflowsService) as jest.Mocked<WorkflowsService>;
    executionsService = module.get(ExecutionsService) as jest.Mocked<ExecutionsService>;

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ============================================================================
  // CREATE TESTS
  // ============================================================================

  describe('create', () => {
    const createDto = {
      name: 'New Workflow',
      description: 'A new workflow',
      triggerType: 'api' as const,
      config: {
        type: 'agent' as const,
        graph: { type: 'react' as const, config: {} },
        agents: {
          default: {
            model: 'gpt-4o',
            temperature: 0.7,
            system_prompt: 'You are a helpful assistant',
            tools: [],
          },
        },
      },
    };

    it('debería crear un workflow exitosamente', async () => {
      // Arrange
      workflowsService.create.mockResolvedValue(mockWorkflow);

      // Act
      const result = await controller.create(mockUser, createDto);

      // Assert
      expect(result).toEqual(mockWorkflow);
      expect(workflowsService.create).toHaveBeenCalledWith(mockUser.organizationId, createDto);
    });

    it('debería pasar el organizationId del usuario actual', async () => {
      // Arrange
      workflowsService.create.mockResolvedValue(mockWorkflow);

      // Act
      await controller.create(mockUser, createDto);

      // Assert
      expect(workflowsService.create).toHaveBeenCalledWith('org-123', createDto);
    });
  });

  // ============================================================================
  // FIND ALL TESTS
  // ============================================================================

  describe('findAll', () => {
    it('debería listar todos los workflows de la organización', async () => {
      // Arrange
      const mockWorkflows = [mockWorkflow, { ...mockWorkflow, id: 'workflow-456' }];
      workflowsService.findAll.mockResolvedValue(mockWorkflows);

      // Act
      const result = await controller.findAll(mockUser, undefined);

      // Assert
      expect(result).toEqual(mockWorkflows);
      expect(workflowsService.findAll).toHaveBeenCalledWith(mockUser.organizationId, false);
    });

    it('debería incluir workflows eliminados cuando includeDeleted=true', async () => {
      // Arrange
      const mockWorkflows = [mockWorkflow];
      workflowsService.findAll.mockResolvedValue(mockWorkflows);

      // Act
      await controller.findAll(mockUser, 'true');

      // Assert
      expect(workflowsService.findAll).toHaveBeenCalledWith(mockUser.organizationId, true);
    });

    it('NO debería incluir workflows eliminados por defecto', async () => {
      // Arrange
      workflowsService.findAll.mockResolvedValue([]);

      // Act
      await controller.findAll(mockUser, undefined);

      // Assert
      expect(workflowsService.findAll).toHaveBeenCalledWith(mockUser.organizationId, false);
    });

    it('debería retornar array vacío si no hay workflows', async () => {
      // Arrange
      workflowsService.findAll.mockResolvedValue([]);

      // Act
      const result = await controller.findAll(mockUser, undefined);

      // Assert
      expect(result).toEqual([]);
    });
  });

  // ============================================================================
  // FIND ONE TESTS
  // ============================================================================

  describe('findOne', () => {
    it('debería obtener un workflow específico', async () => {
      // Arrange
      const workflowId = 'workflow-123';
      workflowsService.findOne.mockResolvedValue(mockWorkflow);

      // Act
      const result = await controller.findOne(mockUser, workflowId);

      // Assert
      expect(result).toEqual(mockWorkflow);
      expect(workflowsService.findOne).toHaveBeenCalledWith(mockUser.organizationId, workflowId);
    });

    it('debería pasar el organizationId y workflowId correctamente', async () => {
      // Arrange
      const workflowId = 'workflow-456';
      workflowsService.findOne.mockResolvedValue(mockWorkflow);

      // Act
      await controller.findOne(mockUser, workflowId);

      // Assert
      expect(workflowsService.findOne).toHaveBeenCalledWith('org-123', 'workflow-456');
    });
  });

  // ============================================================================
  // UPDATE TESTS
  // ============================================================================

  describe('update', () => {
    const updateDto = {
      name: 'Updated Workflow',
      description: 'Updated description',
    };

    it('debería actualizar un workflow exitosamente', async () => {
      // Arrange
      const workflowId = 'workflow-123';
      const updatedWorkflow = { ...mockWorkflow, ...updateDto };
      workflowsService.update.mockResolvedValue(updatedWorkflow);

      // Act
      const result = await controller.update(mockUser, workflowId, updateDto);

      // Assert
      expect(result).toEqual(updatedWorkflow);
      expect(workflowsService.update).toHaveBeenCalledWith(mockUser.organizationId, workflowId, updateDto);
    });

    it('debería pasar organizationId, workflowId y updateDto correctamente', async () => {
      // Arrange
      const workflowId = 'workflow-456';
      workflowsService.update.mockResolvedValue(mockWorkflow);

      // Act
      await controller.update(mockUser, workflowId, updateDto);

      // Assert
      expect(workflowsService.update).toHaveBeenCalledWith('org-123', 'workflow-456', updateDto);
    });
  });

  // ============================================================================
  // REMOVE TESTS
  // ============================================================================

  describe('remove', () => {
    it('debería eliminar un workflow exitosamente', async () => {
      // Arrange
      const workflowId = 'workflow-123';
      const removeResponse = {
        message: 'Workflow eliminado exitosamente',
        workflow: { ...mockWorkflow, deletedAt: new Date() },
      };
      workflowsService.remove.mockResolvedValue(removeResponse);

      // Act
      const result = await controller.remove(mockUser, workflowId);

      // Assert
      expect(result).toEqual(removeResponse);
      expect(workflowsService.remove).toHaveBeenCalledWith(mockUser.organizationId, workflowId);
    });

    it('debería pasar organizationId y workflowId correctamente', async () => {
      // Arrange
      const workflowId = 'workflow-456';
      const removeResponse = {
        message: 'Workflow eliminado exitosamente',
        workflow: mockWorkflow,
      };
      workflowsService.remove.mockResolvedValue(removeResponse);

      // Act
      await controller.remove(mockUser, workflowId);

      // Assert
      expect(workflowsService.remove).toHaveBeenCalledWith('org-123', 'workflow-456');
    });
  });

  // ============================================================================
  // EXECUTE TESTS
  // ============================================================================

  describe('execute', () => {
    const executeDto = {
      input: { data: 'test' },
      metadata: { source: 'api' },
    };

    it('debería ejecutar un workflow con API Key exitosamente', async () => {
      // Arrange
      const workflowId = 'workflow-123';
      const executionResult = {
        id: 'execution-123',
        status: 'pending',
        workflowId,
        organizationId: 'org-123',
      };
      workflowsService.execute.mockResolvedValue(executionResult);

      // Act
      const result = await controller.execute(mockApiKey, workflowId, executeDto);

      // Assert
      expect(result).toEqual(executionResult);
      expect(workflowsService.execute).toHaveBeenCalledWith(
        mockApiKey.organizationId,
        workflowId,
        executeDto.input,
        executeDto.metadata,
        undefined, // userId
        mockApiKey.apiKeyId, // apiKeyId
      );
    });

    it('debería pasar organizationId de la API Key', async () => {
      // Arrange
      const workflowId = 'workflow-123';
      workflowsService.execute.mockResolvedValue({} as any);

      // Act
      await controller.execute(mockApiKey, workflowId, executeDto);

      // Assert
      expect(workflowsService.execute).toHaveBeenCalledWith(
        'org-123',
        expect.any(String),
        expect.any(Object),
        expect.any(Object),
        undefined,
        'key-123',
      );
    });

    it('debería pasar apiKeyId correctamente', async () => {
      // Arrange
      const workflowId = 'workflow-123';
      workflowsService.execute.mockResolvedValue({} as any);

      // Act
      await controller.execute(mockApiKey, workflowId, executeDto);

      // Assert
      const call = workflowsService.execute.mock.calls[0];
      expect(call[5]).toBe('key-123'); // apiKeyId es el sexto parámetro
    });

    it('debería pasar userId como undefined (ejecución por API Key)', async () => {
      // Arrange
      const workflowId = 'workflow-123';
      workflowsService.execute.mockResolvedValue({} as any);

      // Act
      await controller.execute(mockApiKey, workflowId, executeDto);

      // Assert
      const call = workflowsService.execute.mock.calls[0];
      expect(call[4]).toBeUndefined(); // userId es el quinto parámetro
    });
  });

  // ============================================================================
  // GET ANALYTICS TESTS
  // ============================================================================

  describe('getAnalytics', () => {
    it('debería obtener analytics de un workflow', async () => {
      // Arrange
      const workflowId = 'workflow-123';
      const mockAnalytics = {
        workflowId: 'workflow-123',
        workflowName: 'Test Workflow',
        period: '30d',
        totalExecutions: 0,
        byApiKey: [],
        byUser: [],
      };
      executionsService.getAnalyticsBySource.mockResolvedValue(mockAnalytics);

      // Act
      const result = await controller.getAnalytics(mockUser, workflowId, '30d');

      // Assert
      expect(result).toEqual(mockAnalytics);
      expect(executionsService.getAnalyticsBySource).toHaveBeenCalledWith(
        workflowId,
        mockUser.organizationId,
        '30d',
      );
    });

    it('debería usar periodo por defecto 30d si no se especifica', async () => {
      // Arrange
      const workflowId = 'workflow-123';
      executionsService.getAnalyticsBySource.mockResolvedValue({} as any);

      // Act
      await controller.getAnalytics(mockUser, workflowId, '30d');

      // Assert
      expect(executionsService.getAnalyticsBySource).toHaveBeenCalledWith(
        workflowId,
        mockUser.organizationId,
        '30d',
      );
    });

    it('debería aceptar diferentes periodos', async () => {
      // Arrange
      const workflowId = 'workflow-123';
      executionsService.getAnalyticsBySource.mockResolvedValue({} as any);

      // Act
      await controller.getAnalytics(mockUser, workflowId, '7d');

      // Assert
      expect(executionsService.getAnalyticsBySource).toHaveBeenCalledWith(
        workflowId,
        mockUser.organizationId,
        '7d',
      );
    });
  });

  // ============================================================================
  // AUTHORIZATION TESTS
  // ============================================================================

  describe('Authorization', () => {
    it('debería tener @Roles(OWNER, ADMIN) en el endpoint create', () => {
      const metadata = Reflect.getMetadata('roles', controller.create);
      expect(metadata).toEqual([UserRole.OWNER, UserRole.ADMIN]);
    });

    it('debería tener @Roles(OWNER, ADMIN) en el endpoint update', () => {
      const metadata = Reflect.getMetadata('roles', controller.update);
      expect(metadata).toEqual([UserRole.OWNER, UserRole.ADMIN]);
    });

    it('debería tener @Roles(OWNER) en el endpoint remove', () => {
      const metadata = Reflect.getMetadata('roles', controller.remove);
      expect(metadata).toEqual([UserRole.OWNER]);
    });

    it('NO debería tener @Roles en el endpoint findAll (todos pueden ver)', () => {
      const metadata = Reflect.getMetadata('roles', controller.findAll);
      expect(metadata).toBeUndefined();
    });

    it('NO debería tener @Roles en el endpoint findOne (todos pueden ver)', () => {
      const metadata = Reflect.getMetadata('roles', controller.findOne);
      expect(metadata).toBeUndefined();
    });

    it('NO debería tener @Roles en el endpoint getAnalytics (todos pueden ver)', () => {
      const metadata = Reflect.getMetadata('roles', controller.getAnalytics);
      expect(metadata).toBeUndefined();
    });
  });
});
