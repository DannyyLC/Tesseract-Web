import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, Logger } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { PrismaService } from '../database/prisma.service';
import { PlanType } from '@workflow-automation/shared-types';

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let prisma: jest.Mocked<PrismaService>;

  const mockOrganizationId = 'org-123';

  const mockOrganization = {
    id: mockOrganizationId,
    name: 'Test Organization',
    slug: 'test-org',
    plan: PlanType.PRO,
    maxUsers: 10,
    maxWorkflows: 50,
    maxExecutionsPerDay: 1000,
    maxApiKeys: 10,
    isActive: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null,
    _count: {
      users: 3,
      workflows: 10,
      apiKeys: 2,
    },
  };

  const mockUsers = [
    {
      id: 'user-1',
      name: 'John Doe',
      email: 'john@test.com',
      role: 'owner',
      isActive: true,
      createdAt: new Date('2024-01-01'),
      lastLoginAt: new Date('2024-01-10'),
    },
    {
      id: 'user-2',
      name: 'Jane Smith',
      email: 'jane@test.com',
      role: 'admin',
      isActive: true,
      createdAt: new Date('2024-01-05'),
      lastLoginAt: new Date('2024-01-09'),
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
    const mockPrismaService = {
      organization: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findMany: jest.fn(),
      },
      execution: {
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================================================
  // FIND ONE TESTS
  // ============================================================================

  describe('findOne', () => {
    it('debería obtener la información de una organización', async () => {
      // Arrange
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue(mockOrganization);

      // Act
      const result = await service.findOne(mockOrganizationId);

      // Assert
      expect(result).toEqual({
        ...mockOrganization,
        planLimits: expect.objectContaining({
          name: expect.any(String),
          limits: expect.any(Object),
        }),
        usage: {
          users: 3,
          workflows: 10,
          apiKeys: 2,
        },
      });

      expect(prisma.organization.findUnique).toHaveBeenCalledWith({
        where: { id: mockOrganizationId },
        include: {
          _count: {
            select: {
              users: true,
              workflows: true,
              apiKeys: true,
            },
          },
        },
      });
    });

    it('debería lanzar NotFoundException si la organización no existe', async () => {
      // Arrange
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.findOne(mockOrganizationId)).rejects.toThrow(NotFoundException);
      await expect(service.findOne(mockOrganizationId)).rejects.toThrow('Organización no encontrada');
    });

    it('debería incluir los límites del plan en la respuesta', async () => {
      // Arrange
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue(mockOrganization);

      // Act
      const result = await service.findOne(mockOrganizationId);

      // Assert
      expect(result.planLimits).toBeDefined();
      expect(result.planLimits.limits).toBeDefined();
      expect(result.planLimits.limits).toHaveProperty('maxUsers');
      expect(result.planLimits.limits).toHaveProperty('maxWorkflows');
      expect(result.planLimits.limits).toHaveProperty('maxApiKeys');
    });
  });

  // ============================================================================
  // UPDATE TESTS
  // ============================================================================

  describe('update', () => {
    const updateDto = {
      name: 'Updated Organization Name',
    };

    it('debería actualizar la organización exitosamente', async () => {
      // Arrange
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue(mockOrganization);
      const updated = { ...mockOrganization, name: updateDto.name };
      (prisma.organization.update as jest.Mock).mockResolvedValue(updated);

      // Act
      const result = await service.update(mockOrganizationId, updateDto);

      // Assert
      expect(result.name).toBe(updateDto.name);
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: mockOrganizationId },
        data: {
          name: updateDto.name,
        },
      });
    });

    it('debería lanzar NotFoundException si la organización no existe', async () => {
      // Arrange
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.update(mockOrganizationId, updateDto)).rejects.toThrow(NotFoundException);
    });

    it('debería mantener el nombre existente si no se proporciona uno nuevo', async () => {
      // Arrange
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue(mockOrganization);
      (prisma.organization.update as jest.Mock).mockResolvedValue(mockOrganization);

      // Act
      await service.update(mockOrganizationId, {});

      // Assert
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: mockOrganizationId },
        data: {
          name: mockOrganization.name,
        },
      });
    });
  });

  // ============================================================================
  // GET STATS TESTS
  // ============================================================================

  describe('getStats', () => {
    it('debería obtener las estadísticas de uso de la organización', async () => {
      // Arrange
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue(mockOrganization);
      (prisma.execution.count as jest.Mock).mockResolvedValue(50);

      // Act
      const result = await service.getStats(mockOrganizationId);

      // Assert
      expect(result).toEqual({
        plan: PlanType.PRO,
        limits: expect.objectContaining({
          maxUsers: expect.any(Number),
          maxWorkflows: expect.any(Number),
          maxApiKeys: expect.any(Number),
          maxExecutionsPerDay: expect.any(Number),
        }),
        usage: {
          users: {
            current: 3,
            limit: expect.any(Number),
            percentage: expect.any(Number),
          },
          workflows: {
            current: 10,
            limit: expect.any(Number),
            percentage: expect.any(Number),
          },
          apiKeys: {
            current: 2,
            limit: expect.any(Number),
            percentage: expect.any(Number),
          },
          executions: {
            today: 50,
            limit: expect.any(Number),
            percentage: expect.any(Number),
          },
        },
        canAddUser: expect.any(Boolean),
        canAddWorkflow: expect.any(Boolean),
      });
    });

    it('debería calcular correctamente el porcentaje de uso', async () => {
      // Arrange
      const orgWithLimits = {
        ...mockOrganization,
        plan: PlanType.FREE,
        _count: {
          users: 2,
          workflows: 3,
          apiKeys: 1,
        },
      };
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue(orgWithLimits);
      (prisma.execution.count as jest.Mock).mockResolvedValue(50);

      // Act
      const result = await service.getStats(mockOrganizationId);

      // Assert
      // FREE plan: maxUsers=3, current=2 → 66.67%
      expect(result.usage.users.percentage).toBeCloseTo(66.67, 1);
      // FREE plan: maxWorkflows=5, current=3 → 60%
      expect(result.usage.workflows.percentage).toBeCloseTo(60, 1);
    });

    it('debería contar las ejecuciones del día actual', async () => {
      // Arrange
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue(mockOrganization);
      (prisma.execution.count as jest.Mock).mockResolvedValue(100);

      // Act
      await service.getStats(mockOrganizationId);

      // Assert
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      expect(prisma.execution.count).toHaveBeenCalledWith({
        where: {
          workflow: {
            organizationId: mockOrganizationId,
          },
          createdAt: {
            gte: today,
          },
        },
      });
    });

    it('debería retornar 0% de uso para planes ilimitados (ENTERPRISE)', async () => {
      // Arrange
      const enterpriseOrg = {
        ...mockOrganization,
        plan: PlanType.ENTERPRISE,
        _count: {
          users: 100,
          workflows: 500,
          apiKeys: 50,
        },
      };
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue(enterpriseOrg);
      (prisma.execution.count as jest.Mock).mockResolvedValue(10000);

      // Act
      const result = await service.getStats(mockOrganizationId);

      // Assert
      // ENTERPRISE plan tiene límites ilimitados (-1)
      expect(result.usage.users.percentage).toBe(0);
      expect(result.usage.workflows.percentage).toBe(0);
      expect(result.usage.apiKeys.percentage).toBe(0);
      expect(result.usage.executions.percentage).toBe(0);
    });

    it('debería lanzar NotFoundException si la organización no existe', async () => {
      // Arrange
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.getStats(mockOrganizationId)).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================================
  // LIST MEMBERS TESTS
  // ============================================================================

  describe('listMembers', () => {
    it('debería listar todos los miembros de la organización', async () => {
      // Arrange
      (prisma.user.findMany as jest.Mock).mockResolvedValue(mockUsers);

      // Act
      const result = await service.listMembers(mockOrganizationId);

      // Assert
      expect(result).toEqual(mockUsers);
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: mockOrganizationId,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
          lastLoginAt: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });
    });

    it('debería retornar array vacío si no hay miembros', async () => {
      // Arrange
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);

      // Act
      const result = await service.listMembers(mockOrganizationId);

      // Assert
      expect(result).toEqual([]);
    });

    it('NO debería incluir usuarios eliminados', async () => {
      // Arrange
      (prisma.user.findMany as jest.Mock).mockResolvedValue(mockUsers);

      // Act
      await service.listMembers(mockOrganizationId);

      // Assert
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
          }),
        })
      );
    });
  });

  // ============================================================================
  // CAN ADD USER TESTS
  // ============================================================================

  describe('canAddUser', () => {
    it('debería retornar true si puede agregar usuario (FREE plan)', async () => {
      // Arrange
      const freeOrg = {
        ...mockOrganization,
        plan: PlanType.FREE,
        _count: { users: 2 }, // FREE permite 3
      };
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue(freeOrg);

      // Act
      const result = await service.canAddUser(mockOrganizationId);

      // Assert
      expect(result).toBe(true);
    });

    it('debería retornar false si alcanzó el límite (FREE plan)', async () => {
      // Arrange
      const freeOrg = {
        ...mockOrganization,
        plan: PlanType.FREE,
        _count: { users: 3 }, // FREE permite 3 (límite alcanzado)
      };
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue(freeOrg);

      // Act
      const result = await service.canAddUser(mockOrganizationId);

      // Assert
      expect(result).toBe(false);
    });

    it('debería retornar true para ENTERPRISE (ilimitado)', async () => {
      // Arrange
      const enterpriseOrg = {
        ...mockOrganization,
        plan: PlanType.ENTERPRISE,
        _count: { users: 1000 },
      };
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue(enterpriseOrg);

      // Act
      const result = await service.canAddUser(mockOrganizationId);

      // Assert
      expect(result).toBe(true);
    });

    it('debería lanzar NotFoundException si la organización no existe', async () => {
      // Arrange
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.canAddUser(mockOrganizationId)).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================================
  // CAN ADD WORKFLOW TESTS
  // ============================================================================

  describe('canAddWorkflow', () => {
    it('debería retornar true si puede agregar workflow', async () => {
      // Arrange
      const freeOrg = {
        ...mockOrganization,
        plan: PlanType.FREE,
        _count: { workflows: 3 }, // FREE permite 5
      };
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue(freeOrg);

      // Act
      const result = await service.canAddWorkflow(mockOrganizationId);

      // Assert
      expect(result).toBe(true);
    });

    it('debería retornar false si alcanzó el límite', async () => {
      // Arrange
      const freeOrg = {
        ...mockOrganization,
        plan: PlanType.FREE,
        _count: { workflows: 5 }, // FREE permite 5
      };
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue(freeOrg);

      // Act
      const result = await service.canAddWorkflow(mockOrganizationId);

      // Assert
      expect(result).toBe(false);
    });

    it('debería lanzar NotFoundException si la organización no existe', async () => {
      // Arrange
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.canAddWorkflow(mockOrganizationId)).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================================
  // CAN ADD API KEY TESTS
  // ============================================================================

  describe('canAddApiKey', () => {
    it('debería retornar true si puede agregar API key', async () => {
      // Arrange
      const freeOrg = {
        ...mockOrganization,
        plan: PlanType.FREE,
        _count: { apiKeys: 1 }, // FREE permite 2
      };
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue(freeOrg);

      // Act
      const result = await service.canAddApiKey(mockOrganizationId);

      // Assert
      expect(result).toBe(true);
    });

    it('debería retornar false si alcanzó el límite', async () => {
      // Arrange
      const freeOrg = {
        ...mockOrganization,
        plan: PlanType.FREE,
        _count: { apiKeys: 2 }, // FREE permite 2
      };
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue(freeOrg);

      // Act
      const result = await service.canAddApiKey(mockOrganizationId);

      // Assert
      expect(result).toBe(false);
    });

    it('debería retornar true para ENTERPRISE (ilimitado)', async () => {
      // Arrange
      const enterpriseOrg = {
        ...mockOrganization,
        plan: PlanType.ENTERPRISE,
        _count: { apiKeys: 100 },
      };
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue(enterpriseOrg);

      // Act
      const result = await service.canAddApiKey(mockOrganizationId);

      // Assert
      expect(result).toBe(true);
    });

    it('debería lanzar NotFoundException si la organización no existe', async () => {
      // Arrange
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.canAddApiKey(mockOrganizationId)).rejects.toThrow(NotFoundException);
    });
  });
});
