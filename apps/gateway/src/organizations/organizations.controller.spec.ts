import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { UserPayload } from '../common/types/user-payload.type';
import { UserRole, PlanType } from '@workflow-automation/shared-types';

describe('OrganizationsController', () => {
  let controller: OrganizationsController;
  let service: jest.Mocked<OrganizationsService>;

  const mockUser: UserPayload = {
    sub: 'user-123',
    email: 'owner@test.com',
    name: 'Owner User',
    role: UserRole.OWNER,
    organizationId: 'org-123',
    organizationName: 'Test Org',
    plan: PlanType.PRO,
  };

  const mockOrganization = {
    id: 'org-123',
    name: 'Test Organization',
    slug: 'test-org',
    plan: PlanType.PRO,
    maxUsers: 10,
    maxWorkflows: 50,
    maxExecutionsPerDay: 1000,
    maxApiKeys: 10,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    _count: {
      users: 3,
      workflows: 10,
      apiKeys: 2,
    },
    planLimits: {
      name: 'Pro',
      limits: {
        maxUsers: 10,
        maxWorkflows: 50,
        maxExecutionsPerDay: 1000,
        maxApiKeys: 10,
      },
    },
    usage: {
      users: 3,
      workflows: 10,
      apiKeys: 2,
    },
  };

  const mockStats = {
    plan: PlanType.PRO,
    limits: {
      maxUsers: 10,
      maxWorkflows: 50,
      maxExecutionsPerDay: 1000,
      maxApiKeys: 10,
    },
    usage: {
      users: {
        current: 3,
        limit: 10,
        percentage: 30,
      },
      workflows: {
        current: 10,
        limit: 50,
        percentage: 20,
      },
      apiKeys: {
        current: 2,
        limit: 10,
        percentage: 20,
      },
      executions: {
        today: 50,
        limit: 1000,
        percentage: 5,
      },
    },
    canAddUser: true,
    canAddWorkflow: true,
  };

  const mockMembers = [
    {
      id: 'user-1',
      name: 'John Doe',
      email: 'john@test.com',
      role: 'owner',
      isActive: true,
      createdAt: new Date(),
      lastLoginAt: new Date(),
    },
    {
      id: 'user-2',
      name: 'Jane Smith',
      email: 'jane@test.com',
      role: 'admin',
      isActive: true,
      createdAt: new Date(),
      lastLoginAt: new Date(),
    },
  ];

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
    const mockOrganizationsService = {
      findOne: jest.fn(),
      update: jest.fn(),
      getStats: jest.fn(),
      listMembers: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationsController],
      providers: [{ provide: OrganizationsService, useValue: mockOrganizationsService }],
    }).compile();

    controller = module.get<OrganizationsController>(OrganizationsController);
    service = module.get(OrganizationsService) as jest.Mocked<OrganizationsService>;

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ============================================================================
  // GET MY ORGANIZATION TESTS
  // ============================================================================

  describe('getMyOrganization', () => {
    it('debería obtener la organización del usuario autenticado', async () => {
      // Arrange
      service.findOne.mockResolvedValue(mockOrganization);

      // Act
      const result = await controller.getMyOrganization(mockUser);

      // Assert
      expect(result).toEqual(mockOrganization);
      expect(service.findOne).toHaveBeenCalledWith(mockUser.organizationId);
    });

    it('debería usar el organizationId del usuario actual', async () => {
      // Arrange
      service.findOne.mockResolvedValue(mockOrganization);

      // Act
      await controller.getMyOrganization(mockUser);

      // Assert
      expect(service.findOne).toHaveBeenCalledWith('org-123');
    });
  });

  // ============================================================================
  // UPDATE MY ORGANIZATION TESTS
  // ============================================================================

  describe('updateMyOrganization', () => {
    const updateDto = {
      name: 'Updated Organization Name',
    };

    it('debería actualizar la organización exitosamente', async () => {
      // Arrange
      const updated = { ...mockOrganization, name: updateDto.name };
      service.update.mockResolvedValue(updated);

      // Act
      const result = await controller.updateMyOrganization(mockUser, updateDto);

      // Assert
      expect(result.name).toBe(updateDto.name);
      expect(service.update).toHaveBeenCalledWith(mockUser.organizationId, updateDto);
    });

    it('debería pasar el organizationId del usuario actual', async () => {
      // Arrange
      service.update.mockResolvedValue(mockOrganization);

      // Act
      await controller.updateMyOrganization(mockUser, updateDto);

      // Assert
      expect(service.update).toHaveBeenCalledWith('org-123', updateDto);
    });
  });

  // ============================================================================
  // GET MY STATS TESTS
  // ============================================================================

  describe('getMyStats', () => {
    it('debería obtener las estadísticas de la organización', async () => {
      // Arrange
      service.getStats.mockResolvedValue(mockStats);

      // Act
      const result = await controller.getMyStats(mockUser);

      // Assert
      expect(result).toEqual(mockStats);
      expect(service.getStats).toHaveBeenCalledWith(mockUser.organizationId);
    });

    it('debería incluir el uso actual y los límites', async () => {
      // Arrange
      service.getStats.mockResolvedValue(mockStats);

      // Act
      const result = await controller.getMyStats(mockUser);

      // Assert
      expect(result.usage).toBeDefined();
      expect(result.usage.users).toHaveProperty('current');
      expect(result.usage.users).toHaveProperty('limit');
      expect(result.usage.users).toHaveProperty('percentage');
    });

    it('debería incluir indicadores canAdd', async () => {
      // Arrange
      service.getStats.mockResolvedValue(mockStats);

      // Act
      const result = await controller.getMyStats(mockUser);

      // Assert
      expect(result).toHaveProperty('canAddUser');
      expect(result).toHaveProperty('canAddWorkflow');
    });
  });

  // ============================================================================
  // GET MEMBERS TESTS
  // ============================================================================

  describe('getMembers', () => {
    it('debería listar todos los miembros de la organización', async () => {
      // Arrange
      service.listMembers.mockResolvedValue(mockMembers);

      // Act
      const result = await controller.getMembers(mockUser);

      // Assert
      expect(result).toEqual(mockMembers);
      expect(service.listMembers).toHaveBeenCalledWith(mockUser.organizationId);
    });

    it('debería retornar array vacío si no hay miembros', async () => {
      // Arrange
      service.listMembers.mockResolvedValue([]);

      // Act
      const result = await controller.getMembers(mockUser);

      // Assert
      expect(result).toEqual([]);
    });
  });

  // ============================================================================
  // AUTHORIZATION TESTS
  // ============================================================================

  describe('Authorization', () => {
    it('debería tener @Roles(OWNER) en el endpoint updateMyOrganization', () => {
      const metadata = Reflect.getMetadata('roles', controller.updateMyOrganization);
      expect(metadata).toEqual([UserRole.OWNER]);
    });

    it('debería tener @Roles(OWNER, ADMIN) en el endpoint getMembers', () => {
      const metadata = Reflect.getMetadata('roles', controller.getMembers);
      expect(metadata).toEqual([UserRole.OWNER, UserRole.ADMIN]);
    });

    it('NO debería tener @Roles en getMyOrganization (todos pueden ver)', () => {
      const metadata = Reflect.getMetadata('roles', controller.getMyOrganization);
      expect(metadata).toBeUndefined();
    });

    it('NO debería tener @Roles en getMyStats (todos pueden ver)', () => {
      const metadata = Reflect.getMetadata('roles', controller.getMyStats);
      expect(metadata).toBeUndefined();
    });
  });

  // ============================================================================
  // ENDPOINT PATHS TESTS
  // ============================================================================

  describe('Endpoint Paths', () => {
    it('debería tener la ruta base /organizations', () => {
      const metadata = Reflect.getMetadata('path', OrganizationsController);
      expect(metadata).toBe('organizations');
    });

    it('debería tener GET /organizations/me para getMyOrganization', () => {
      const metadata = Reflect.getMetadata('path', controller.getMyOrganization);
      expect(metadata).toBe('me');
    });

    it('debería tener PUT /organizations/me para updateMyOrganization', () => {
      const metadata = Reflect.getMetadata('path', controller.updateMyOrganization);
      expect(metadata).toBe('me');
    });

    it('debería tener GET /organizations/me/stats para getMyStats', () => {
      const metadata = Reflect.getMetadata('path', controller.getMyStats);
      expect(metadata).toBe('me/stats');
    });

    it('debería tener GET /organizations/me/members para getMembers', () => {
      const metadata = Reflect.getMetadata('path', controller.getMembers);
      expect(metadata).toBe('me/members');
    });
  });
});
