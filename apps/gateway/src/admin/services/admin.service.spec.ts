import { Test, TestingModule } from '@nestjs/testing';
import { Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { PrismaService } from '../../database/prisma.service';
import * as bcrypt from 'bcrypt';

// Mock bcrypt
const mockHash = jest.fn();
jest.mock('bcrypt', () => ({
  hash: (...args: any[]) => mockHash(...args),
}));

describe('AdminService', () => {
  let service: AdminService;
  let prismaService: jest.Mocked<PrismaService>;

  const mockOrganization = {
    id: 'org-123',
    name: 'Test Org',
    slug: 'test-org',
    plan: 'pro',
    maxUsers: 50,
    maxWorkflows: 100,
    maxExecutionsPerDay: 1000,
    maxApiKeys: 10,
    isActive: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockUser = {
    id: 'user-123',
    email: 'user@test.com',
    name: 'Test User',
    password: 'hashed-password',
    role: 'admin',
    isActive: true,
    organizationId: 'org-123',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
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
      organization: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        groupBy: jest.fn(),
      },
      user: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      workflow: {
        count: jest.fn(),
      },
      execution: {
        count: jest.fn(),
      },
      apiKey: {
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    prismaService = module.get(PrismaService) as jest.Mocked<PrismaService>;

    // Reset bcrypt mock
    mockHash.mockResolvedValue('hashed-password');

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================================================
  // ORGANIZATIONS MANAGEMENT TESTS
  // ============================================================================

  describe('createOrganization', () => {
    const createData = {
      name: 'New Org',
      slug: 'new-org',
      plan: 'pro' as const,
    };

    it('debería crear una organización con plan PRO', async () => {
      // Arrange
      prismaService.organization.findUnique.mockResolvedValue(null);
      prismaService.organization.create.mockResolvedValue(mockOrganization as any);

      // Act
      const result = await service.createOrganization(createData);

      // Assert
      expect(result).toEqual(mockOrganization);
      expect(prismaService.organization.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'New Org',
          slug: 'new-org',
          plan: 'pro',
          maxUsers: expect.any(Number),
          maxWorkflows: expect.any(Number),
        }),
      });
    });

    it('debería verificar que el slug sea único', async () => {
      // Arrange
      prismaService.organization.findUnique.mockResolvedValue(mockOrganization as any);

      // Act & Assert
      await expect(service.createOrganization(createData)).rejects.toThrow(
        'El slug "new-org" ya está en uso',
      );
      expect(prismaService.organization.create).not.toHaveBeenCalled();
    });

    it('debería crear organización con plan FREE por defecto', async () => {
      // Arrange
      const dataWithoutPlan = { name: 'New Org', slug: 'new-org' };
      prismaService.organization.findUnique.mockResolvedValue(null);
      prismaService.organization.create.mockResolvedValue(mockOrganization as any);

      // Act
      await service.createOrganization(dataWithoutPlan);

      // Assert
      expect(prismaService.organization.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          plan: 'free',
        }),
      });
    });
  });

  describe('getAllOrganizations', () => {
    const mockOrgWithCount = {
      ...mockOrganization,
      _count: { users: 10, workflows: 50, executions: 1000, apiKeys: 5 },
    };

    it('debería listar todas las organizaciones con paginación', async () => {
      // Arrange
      const mockOrgs = [mockOrgWithCount, { ...mockOrgWithCount, id: 'org-456' }];
      prismaService.organization.findMany.mockResolvedValue(mockOrgs as any);
      prismaService.organization.count.mockResolvedValue(100);

      // Act
      const result = await service.getAllOrganizations({ page: 1, limit: 50 });

      // Assert
      expect(result.data).toHaveLength(2);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 50,
        total: 100,
        totalPages: 2,
      });
    });

    it('debería filtrar por búsqueda de texto', async () => {
      // Arrange
      prismaService.organization.findMany.mockResolvedValue([mockOrgWithCount] as any);
      prismaService.organization.count.mockResolvedValue(1);

      // Act
      await service.getAllOrganizations({ search: 'test' });

      // Assert
      const call = prismaService.organization.findMany.mock.calls[0][0];
      expect(call.where.OR).toBeDefined();
    });

    it('debería filtrar por plan', async () => {
      // Arrange
      prismaService.organization.findMany.mockResolvedValue([mockOrgWithCount] as any);
      prismaService.organization.count.mockResolvedValue(1);

      // Act
      await service.getAllOrganizations({ plan: 'pro' });

      // Assert
      const call = prismaService.organization.findMany.mock.calls[0][0];
      expect(call.where.plan).toBe('pro');
    });

    it('debería filtrar por estado activo', async () => {
      // Arrange
      prismaService.organization.findMany.mockResolvedValue([mockOrgWithCount] as any);
      prismaService.organization.count.mockResolvedValue(1);

      // Act
      await service.getAllOrganizations({ isActive: true });

      // Assert
      const call = prismaService.organization.findMany.mock.calls[0][0];
      expect(call.where.isActive).toBe(true);
    });
  });

  describe('getOrganization', () => {
    it('debería obtener detalles de una organización', async () => {
      // Arrange
      const mockOrgWithDetails = {
        ...mockOrganization,
        users: [mockUser],
        _count: {
          users: 10,
          workflows: 50,
          executions: 1000,
          apiKeys: 5,
        },
      };
      prismaService.organization.findUnique.mockResolvedValue(mockOrgWithDetails as any);

      // Act
      const result = await service.getOrganization('org-123');

      // Assert
      expect(result).toEqual(mockOrgWithDetails);
      expect(prismaService.organization.findUnique).toHaveBeenCalledWith({
        where: { id: 'org-123' },
        include: expect.any(Object),
      });
    });

    it('debería lanzar NotFoundException si no existe', async () => {
      // Arrange
      prismaService.organization.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getOrganization('invalid-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('changeOrganizationPlan', () => {
    it('debería cambiar el plan y actualizar límites', async () => {
      // Arrange
      prismaService.organization.findUnique.mockResolvedValue(mockOrganization as any);
      prismaService.organization.update.mockResolvedValue({
        ...mockOrganization,
        plan: 'enterprise',
      } as any);

      // Act
      const result = await service.changeOrganizationPlan('org-123', 'enterprise');

      // Assert
      expect(result.message).toBeDefined();
      expect(prismaService.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-123' },
        data: expect.objectContaining({
          plan: 'enterprise',
          maxUsers: expect.any(Number),
        }),
      });
    });

    it('debería lanzar NotFoundException si la organización no existe', async () => {
      // Arrange
      prismaService.organization.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.changeOrganizationPlan('invalid-id', 'pro')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateOrganizationLimits', () => {
    it('debería actualizar límites personalizados', async () => {
      // Arrange
      const limits = { maxUsers: 100, maxWorkflows: 200 };
      prismaService.organization.findUnique.mockResolvedValue(mockOrganization as any);
      prismaService.organization.update.mockResolvedValue({
        ...mockOrganization,
        ...limits,
      } as any);

      // Act
      const result = await service.updateOrganizationLimits('org-123', limits);

      // Assert
      expect(result.message).toBeDefined();
      expect(prismaService.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-123' },
        data: limits,
      });
    });

    it('debería lanzar NotFoundException si no existe', async () => {
      // Arrange
      prismaService.organization.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.updateOrganizationLimits('invalid-id', { maxUsers: 100 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('toggleOrganizationStatus', () => {
    it('debería activar una organización', async () => {
      // Arrange
      prismaService.organization.findUnique.mockResolvedValue(mockOrganization as any);
      prismaService.organization.update.mockResolvedValue({
        ...mockOrganization,
        isActive: true,
      } as any);

      // Act
      const result = await service.toggleOrganizationStatus('org-123', true);

      // Assert
      expect(result.message).toContain('activada');
      expect(prismaService.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-123' },
        data: { isActive: true },
      });
    });

    it('debería desactivar una organización', async () => {
      // Arrange
      prismaService.organization.findUnique.mockResolvedValue(mockOrganization as any);
      prismaService.organization.update.mockResolvedValue({
        ...mockOrganization,
        isActive: false,
      } as any);

      // Act
      const result = await service.toggleOrganizationStatus('org-123', false);

      // Assert
      expect(result.message).toContain('pausada');
    });

    it('debería lanzar NotFoundException si no existe', async () => {
      // Arrange
      prismaService.organization.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.toggleOrganizationStatus('invalid-id', true)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteOrganization', () => {
    it('debería hacer soft delete de una organización', async () => {
      // Arrange
      prismaService.organization.findUnique.mockResolvedValue(mockOrganization as any);
      prismaService.organization.update.mockResolvedValue({
        ...mockOrganization,
        deletedAt: new Date(),
      } as any);

      // Act
      const result = await service.deleteOrganization('org-123');

      // Assert
      expect(result.message).toContain('eliminada');
      expect(prismaService.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-123' },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('debería lanzar NotFoundException si no existe', async () => {
      // Arrange
      prismaService.organization.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.deleteOrganization('invalid-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================================
  // USERS MANAGEMENT TESTS
  // ============================================================================

  describe('createUser', () => {
    const userData = {
      email: 'newuser@test.com',
      name: 'New User',
      password: 'password123',
      role: 'admin' as const,
    };

    it('debería crear un usuario con password hasheado', async () => {
      // Arrange
      prismaService.organization.findUnique.mockResolvedValue(mockOrganization as any);
      prismaService.user.findUnique.mockResolvedValue(null);
      prismaService.user.create.mockResolvedValue(mockUser as any);
      mockHash.mockResolvedValue('hashed-password-123');

      // Act
      const result = await service.createUser('org-123', userData);

      // Assert
      expect(result).toBeDefined();
      expect(mockHash).toHaveBeenCalledWith('password123', 10);
      expect(prismaService.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'newuser@test.com',
          password: 'hashed-password-123',
          emailVerified: true, // Auto-verificado por admin
        }),
        select: expect.any(Object),
      });
    });

    it('debería verificar que el email sea único', async () => {
      // Arrange
      prismaService.organization.findUnique.mockResolvedValue(mockOrganization as any);
      prismaService.user.findUnique.mockResolvedValue(mockUser as any);

      // Act & Assert
      await expect(service.createUser('org-123', userData)).rejects.toThrow(
        'El email "newuser@test.com" ya está en uso',
      );
      expect(prismaService.user.create).not.toHaveBeenCalled();
    });

    it('debería auto-verificar el email del usuario', async () => {
      // Arrange
      prismaService.organization.findUnique.mockResolvedValue(mockOrganization as any);
      prismaService.user.findUnique.mockResolvedValue(null);
      prismaService.user.create.mockResolvedValue(mockUser as any);

      // Act
      await service.createUser('org-123', userData);

      // Assert
      const call = prismaService.user.create.mock.calls[0][0];
      expect(call.data.emailVerified).toBe(true);
    });

    it('debería lanzar NotFoundException si la organización no existe', async () => {
      // Arrange
      prismaService.organization.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.createUser('invalid-org', userData)).rejects.toThrow(
        NotFoundException,
      );
      expect(prismaService.user.create).not.toHaveBeenCalled();
    });
  });

  describe('getOrganizationUsers', () => {
    it('debería listar usuarios de una organización', async () => {
      // Arrange
      prismaService.organization.findUnique.mockResolvedValue(mockOrganization as any);
      const mockUsers = [mockUser, { ...mockUser, id: 'user-456' }];
      prismaService.user.findMany.mockResolvedValue(mockUsers as any);

      // Act
      const result = await service.getOrganizationUsers('org-123');

      // Assert
      expect(result).toEqual(mockUsers);
      expect(prismaService.user.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
        select: expect.any(Object),
      });
    });

    it('debería verificar que la organización exista', async () => {
      // Arrange
      prismaService.organization.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getOrganizationUsers('invalid-org')).rejects.toThrow(
        NotFoundException,
      );
      expect(prismaService.user.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getUser', () => {
    it('debería obtener detalles de un usuario', async () => {
      // Arrange
      const mockUserWithOrg = {
        ...mockUser,
        organization: mockOrganization,
        _count: { executionsManual: 100 },
      };
      prismaService.user.findUnique.mockResolvedValue(mockUserWithOrg as any);

      // Act
      const result = await service.getUser('user-123');

      // Assert
      expect(result).toBeDefined();
      expect(result).not.toHaveProperty('password');
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        include: expect.any(Object),
      });
    });

    it('debería lanzar NotFoundException si no existe', async () => {
      // Arrange
      prismaService.user.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getUser('invalid-id')).rejects.toThrow(NotFoundException);
    });

    it('debería excluir password del resultado', async () => {
      // Arrange
      prismaService.user.findUnique.mockResolvedValue(mockUser as any);

      // Act
      const result = await service.getUser('user-123');

      // Assert
      expect(result).not.toHaveProperty('password');
    });
  });

  describe('changeUserRole', () => {
    it('debería cambiar el rol de un usuario', async () => {
      // Arrange
      prismaService.user.findUnique.mockResolvedValue(mockUser as any);
      prismaService.user.update.mockResolvedValue({
        ...mockUser,
        role: 'owner',
      } as any);

      // Act
      const result = await service.changeUserRole('user-123', 'owner');

      // Assert
      expect(result.message).toBeDefined();
      expect(result.user).not.toHaveProperty('password');
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { role: 'owner' },
      });
    });

    it('debería lanzar NotFoundException si no existe', async () => {
      // Arrange
      prismaService.user.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.changeUserRole('invalid-id', 'admin')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('toggleUserStatus', () => {
    it('debería activar un usuario', async () => {
      // Arrange
      prismaService.user.findUnique.mockResolvedValue(mockUser as any);
      prismaService.user.update.mockResolvedValue({
        ...mockUser,
        isActive: true,
      } as any);

      // Act
      const result = await service.toggleUserStatus('user-123', true);

      // Assert
      expect(result.message).toContain('activado');
      expect(result.user).not.toHaveProperty('password');
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { isActive: true },
      });
    });

    it('debería pausar un usuario', async () => {
      // Arrange
      prismaService.user.findUnique.mockResolvedValue(mockUser as any);
      prismaService.user.update.mockResolvedValue({
        ...mockUser,
        isActive: false,
      } as any);

      // Act
      const result = await service.toggleUserStatus('user-123', false);

      // Assert
      expect(result.message).toContain('pausado');
      expect(result.user).not.toHaveProperty('password');
    });

    it('debería lanzar NotFoundException si no existe', async () => {
      // Arrange
      prismaService.user.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.toggleUserStatus('invalid-id', true)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ============================================================================
  // ANALYTICS TESTS
  // ============================================================================

  describe('getGlobalStats', () => {
    it('debería obtener estadísticas globales del sistema', async () => {
      // Arrange
      prismaService.organization.count
        .mockResolvedValueOnce(100) // total orgs
        .mockResolvedValueOnce(85); // active orgs
      prismaService.user.count
        .mockResolvedValueOnce(500) // total users
        .mockResolvedValueOnce(450); // active users
      prismaService.workflow.count
        .mockResolvedValueOnce(1000) // total workflows
        .mockResolvedValueOnce(900); // active workflows
      prismaService.execution.count
        .mockResolvedValueOnce(10000) // total executions
        .mockResolvedValueOnce(8500); // successful executions (failed is calculated)
      prismaService.apiKey.count.mockResolvedValue(250);

      // Act
      const result = await service.getGlobalStats();

      // Assert
      expect(result).toEqual({
        organizations: { total: 100, active: 85 },
        users: { total: 500, active: 450 },
        workflows: { total: 1000, active: 900 },
        executions: {
          total: 10000,
          successful: 8500,
          failed: 1500,
          successRate: 85,
        },
        apiKeys: { total: 250 },
      });
    });
  });

  describe('getStatsByPlan', () => {
    it('debería obtener conteo de organizaciones por plan', async () => {
      // Arrange
      const mockGroupBy = [
        { plan: 'free', _count: { plan: 50 } },
        { plan: 'pro', _count: { plan: 30 } },
        { plan: 'enterprise', _count: { plan: 20 } },
      ];
      prismaService.organization.groupBy.mockResolvedValue(mockGroupBy as any);

      // Act
      const result = await service.getStatsByPlan();

      // Assert
      expect(result).toEqual([
        { plan: 'free', count: 50 },
        { plan: 'pro', count: 30 },
        { plan: 'enterprise', count: 20 },
      ]);
    });
  });

  describe('getTopOrganizations', () => {
    it('debería obtener top 10 organizaciones por ejecuciones', async () => {
      // Arrange
      const mockOrgs = [
        {
          ...mockOrganization,
          _count: { users: 10, workflows: 50, executions: 1000 },
        },
        {
          ...mockOrganization,
          id: 'org-456',
          _count: { users: 8, workflows: 40, executions: 800 },
        },
      ];
      prismaService.organization.findMany.mockResolvedValue(mockOrgs as any);

      // Act
      const result = await service.getTopOrganizations('executions', 10);

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('count');
      expect(result[0].count).toBe(1000);
      expect(prismaService.organization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null },
          take: 10,
        }),
      );
    });

    it('debería obtener top organizaciones por workflows', async () => {
      // Arrange
      const mockOrgs = [
        {
          ...mockOrganization,
          _count: { users: 10, workflows: 50, executions: 1000 },
        },
      ];
      prismaService.organization.findMany.mockResolvedValue(mockOrgs as any);

      // Act
      const result = await service.getTopOrganizations('workflows', 5);

      // Assert
      expect(result[0].count).toBe(50);
      const call = prismaService.organization.findMany.mock.calls[0][0];
      expect(call.take).toBe(5);
    });

    it('debería obtener top organizaciones por usuarios', async () => {
      // Arrange
      const mockOrgs = [
        {
          ...mockOrganization,
          _count: { users: 10, workflows: 50, executions: 1000 },
        },
      ];
      prismaService.organization.findMany.mockResolvedValue(mockOrgs as any);

      // Act
      const result = await service.getTopOrganizations('users', 10);

      // Assert
      expect(result[0].count).toBe(10);
    });
  });
});
