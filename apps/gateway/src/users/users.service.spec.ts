import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../database/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { UserRole } from '@workflow-automation/shared-types';
import * as bcrypt from 'bcrypt';

// Mock bcrypt functions
const mockHash = jest.fn();
const mockCompare = jest.fn();

jest.mock('bcrypt', () => ({
  hash: (...args: any[]) => mockHash(...args),
  compare: (...args: any[]) => mockCompare(...args),
}));

describe('UsersService', () => {
  let service: UsersService;
  let prisma: jest.Mocked<PrismaService>;
  let organizationsService: jest.Mocked<OrganizationsService>;

  const mockOrganizationId = 'org-123';
  const mockUserId = 'user-123';
  const mockRequesterId = 'requester-456';

  const mockUser = {
    id: mockUserId,
    email: 'user@test.com',
    name: 'Test User',
    role: UserRole.VIEWER,
    organizationId: mockOrganizationId,
    isActive: true,
    emailVerified: true,
    password: '$2b$10$hashedpassword',
    refreshToken: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null,
    lastLoginAt: null,
  };

  const mockRequester = {
    id: mockRequesterId,
    email: 'admin@test.com',
    name: 'Admin User',
    role: UserRole.ADMIN,
    organizationId: mockOrganizationId,
    isActive: true,
    emailVerified: true,
    password: '$2b$10$hashedpassword',
    refreshToken: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null,
    lastLoginAt: null,
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
      user: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      refreshToken: {
        updateMany: jest.fn(),
      },
    };

    const mockOrganizationsService = {
      canAddUser: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: OrganizationsService, useValue: mockOrganizationsService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
    organizationsService = module.get(OrganizationsService) as jest.Mocked<OrganizationsService>;

    // Setup bcrypt mocks
    mockHash.mockResolvedValue('$2b$10$hashedpassword');
    mockCompare.mockResolvedValue(true);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================================================
  // INVITE TESTS
  // ============================================================================

  describe('invite', () => {
    const inviteDto = {
      email: 'newuser@test.com',
      name: 'New User',
      role: UserRole.VIEWER,
      password: 'password123',
    };

    it('debería invitar un usuario exitosamente', async () => {
      // Arrange
      organizationsService.canAddUser.mockResolvedValue(true);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      const createdUser = {
        id: 'user-new',
        email: inviteDto.email,
        name: inviteDto.name,
        role: inviteDto.role,
        isActive: true,
        createdAt: new Date(),
      };
      (prisma.user.create as jest.Mock).mockResolvedValue(createdUser);

      // Act
      const result = await service.invite(mockOrganizationId, UserRole.OWNER, inviteDto);

      // Assert
      expect(result).toEqual(createdUser);

      expect(organizationsService.canAddUser).toHaveBeenCalledWith(mockOrganizationId);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: inviteDto.email },
      });
      expect(mockHash).toHaveBeenCalledWith(inviteDto.password, 10);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: inviteDto.email,
          name: inviteDto.name,
          password: '$2b$10$hashedpassword',
          role: inviteDto.role,
          organizationId: mockOrganizationId,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      });
    });

    it('debería lanzar ForbiddenException si un VIEWER intenta invitar', async () => {
      // Act & Assert
      await expect(service.invite(mockOrganizationId, UserRole.VIEWER, inviteDto)).rejects.toThrow(ForbiddenException);
      await expect(service.invite(mockOrganizationId, UserRole.VIEWER, inviteDto)).rejects.toThrow(
        'No tienes permiso para invitar usuarios'
      );
    });

    it('debería lanzar ForbiddenException si un ADMIN intenta invitar', async () => {
      // Arrange - ADMIN no tiene permiso de USERS_INVITE

      // Act & Assert
      await expect(service.invite(mockOrganizationId, UserRole.ADMIN, inviteDto)).rejects.toThrow(ForbiddenException);
      await expect(service.invite(mockOrganizationId, UserRole.ADMIN, inviteDto)).rejects.toThrow(
        'No tienes permiso para invitar usuarios'
      );
    });

    it('debería permitir a un OWNER invitar a otro OWNER', async () => {
      // Arrange
      const ownerInvite = { ...inviteDto, role: UserRole.OWNER };
      organizationsService.canAddUser.mockResolvedValue(true);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue({
        id: 'user-new',
        email: ownerInvite.email,
        name: ownerInvite.name,
        role: UserRole.OWNER,
        isActive: true,
        createdAt: new Date(),
      });

      // Act
      const result = await service.invite(mockOrganizationId, UserRole.OWNER, ownerInvite);

      // Assert
      expect(result).toBeDefined();
      expect(result.role).toBe(UserRole.OWNER);
    });

    it('debería lanzar BadRequestException si se alcanza el límite de usuarios', async () => {
      // Arrange
      organizationsService.canAddUser.mockResolvedValue(false);

      // Act & Assert
      await expect(service.invite(mockOrganizationId, UserRole.OWNER, inviteDto)).rejects.toThrow(BadRequestException);
      await expect(service.invite(mockOrganizationId, UserRole.OWNER, inviteDto)).rejects.toThrow(
        'Has alcanzado el límite de usuarios de tu plan'
      );
    });

    it('debería lanzar ConflictException si el email ya existe', async () => {
      // Arrange
      organizationsService.canAddUser.mockResolvedValue(true);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      // Act & Assert
      await expect(service.invite(mockOrganizationId, UserRole.OWNER, inviteDto)).rejects.toThrow(ConflictException);
      await expect(service.invite(mockOrganizationId, UserRole.OWNER, inviteDto)).rejects.toThrow(
        'El email ya está registrado'
      );
    });

    it('debería hashear la contraseña con bcrypt', async () => {
      // Arrange
      organizationsService.canAddUser.mockResolvedValue(true);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue({
        id: 'user-new',
        email: inviteDto.email,
        name: inviteDto.name,
        role: inviteDto.role,
        isActive: true,
        createdAt: new Date(),
      });

      // Act
      await service.invite(mockOrganizationId, UserRole.OWNER, inviteDto);

      // Assert
      expect(mockHash).toHaveBeenCalledWith(inviteDto.password, 10);
      const createCall = (prisma.user.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.password).toBe('$2b$10$hashedpassword');
    });
  });

  // ============================================================================
  // FIND ALL TESTS
  // ============================================================================

  describe('findAll', () => {
    it('debería listar todos los usuarios de una organización', async () => {
      // Arrange
      const users = [
        {
          id: mockUser.id,
          email: mockUser.email,
          name: mockUser.name,
          role: mockUser.role,
          isActive: mockUser.isActive,
          createdAt: mockUser.createdAt,
          lastLoginAt: mockUser.lastLoginAt,
        },
        {
          id: 'user-456',
          email: 'user2@test.com',
          name: 'User 2',
          role: UserRole.ADMIN,
          isActive: true,
          createdAt: new Date(),
          lastLoginAt: null,
        },
      ];
      (prisma.user.findMany as jest.Mock).mockResolvedValue(users);

      // Act
      const result = await service.findAll(mockOrganizationId);

      // Assert
      expect(result).toHaveLength(2);
      expect(result).toEqual(users);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { organizationId: mockOrganizationId, deletedAt: null },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          createdAt: true,
          lastLoginAt: true,
        },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      });
    });

    it('debería retornar array vacío si no hay usuarios', async () => {
      // Arrange
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);

      // Act
      const result = await service.findAll(mockOrganizationId);

      // Assert
      expect(result).toEqual([]);
    });

    it('NO debería incluir usuarios eliminados (soft delete)', async () => {
      // Arrange
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);

      // Act
      await service.findAll(mockOrganizationId);

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
  // FIND ONE TESTS
  // ============================================================================

  describe('findOne', () => {
    it('debería obtener un usuario específico', async () => {
      // Arrange
      const userResponse = {
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        role: mockUser.role,
        isActive: mockUser.isActive,
        createdAt: mockUser.createdAt,
        updatedAt: mockUser.updatedAt,
        lastLoginAt: mockUser.lastLoginAt,
      };
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(userResponse);

      // Act
      const result = await service.findOne(mockUserId, mockOrganizationId);

      // Assert
      expect(result).toEqual(userResponse);

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          id: mockUserId,
          organizationId: mockOrganizationId,
          deletedAt: null,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          lastLoginAt: true,
        },
      });
    });

    it('debería lanzar NotFoundException si el usuario no existe', async () => {
      // Arrange
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.findOne(mockUserId, mockOrganizationId)).rejects.toThrow(NotFoundException);
      await expect(service.findOne(mockUserId, mockOrganizationId)).rejects.toThrow('Usuario no encontrado');
    });

    it('NO debería exponer password ni refreshToken', async () => {
      // Arrange
      const userResponse = {
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        role: mockUser.role,
        isActive: mockUser.isActive,
        createdAt: mockUser.createdAt,
        updatedAt: mockUser.updatedAt,
        lastLoginAt: mockUser.lastLoginAt,
      };
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(userResponse);

      // Act
      const result = await service.findOne(mockUserId, mockOrganizationId);

      // Assert
      expect(result).not.toHaveProperty('password');
      expect(result).not.toHaveProperty('refreshToken');
    });
  });

  // ============================================================================
  // UPDATE TESTS
  // ============================================================================

  describe('update', () => {
    const updateDto = {
      role: UserRole.ADMIN,
      isActive: true,
    };

    it('debería actualizar un usuario exitosamente', async () => {
      // Arrange
      const userResponse = {
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        role: mockUser.role,
        isActive: mockUser.isActive,
        createdAt: mockUser.createdAt,
        updatedAt: mockUser.updatedAt,
        lastLoginAt: mockUser.lastLoginAt,
      };
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(userResponse);
      const updatedUser = { ...userResponse, role: UserRole.ADMIN };
      (prisma.user.update as jest.Mock).mockResolvedValue(updatedUser);

      // Act
      const result = await service.update(mockUserId, mockOrganizationId, UserRole.OWNER, mockRequesterId, updateDto);

      // Assert
      expect(result).toEqual(updatedUser);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUserId },
        data: {
          role: updateDto.role,
          isActive: updateDto.isActive,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          updatedAt: true,
        },
      });
    });

    it('debería lanzar ForbiddenException si intentas cambiar tu propio rol', async () => {
      // Arrange
      const userResponse = {
        id: mockUserId,
        email: mockUser.email,
        name: mockUser.name,
        role: mockUser.role,
        isActive: mockUser.isActive,
        createdAt: mockUser.createdAt,
        updatedAt: mockUser.updatedAt,
        lastLoginAt: mockUser.lastLoginAt,
      };
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(userResponse);

      // Act & Assert
      await expect(
        service.update(mockUserId, mockOrganizationId, UserRole.ADMIN, mockUserId, { role: UserRole.OWNER })
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.update(mockUserId, mockOrganizationId, UserRole.ADMIN, mockUserId, { role: UserRole.OWNER })
      ).rejects.toThrow('No puedes cambiar tu propio rol');
    });

    it('debería lanzar ForbiddenException si un VIEWER intenta cambiar roles', async () => {
      // Arrange
      const userResponse = {
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        role: mockUser.role,
        isActive: mockUser.isActive,
        createdAt: mockUser.createdAt,
        updatedAt: mockUser.updatedAt,
        lastLoginAt: mockUser.lastLoginAt,
      };
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(userResponse);

      // Act & Assert
      await expect(
        service.update(mockUserId, mockOrganizationId, UserRole.VIEWER, mockRequesterId, { role: UserRole.ADMIN })
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.update(mockUserId, mockOrganizationId, UserRole.VIEWER, mockRequesterId, { role: UserRole.ADMIN })
      ).rejects.toThrow('No tienes permiso para cambiar roles');
    });

    it('debería lanzar ForbiddenException si un ADMIN intenta cambiar roles', async () => {
      // Arrange
      const userResponse = {
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        role: mockUser.role,
        isActive: mockUser.isActive,
        createdAt: mockUser.createdAt,
        updatedAt: mockUser.updatedAt,
        lastLoginAt: mockUser.lastLoginAt,
      };
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(userResponse);

      // Act & Assert
      await expect(
        service.update(mockUserId, mockOrganizationId, UserRole.ADMIN, mockRequesterId, { role: UserRole.VIEWER })
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.update(mockUserId, mockOrganizationId, UserRole.ADMIN, mockRequesterId, { role: UserRole.VIEWER })
      ).rejects.toThrow('No tienes permiso para cambiar roles');
    });

    it('debería lanzar ForbiddenException si un ADMIN intenta cambiar isActive', async () => {
      // Arrange
      const userResponse = {
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        role: mockUser.role,
        isActive: mockUser.isActive,
        createdAt: mockUser.createdAt,
        updatedAt: mockUser.updatedAt,
        lastLoginAt: mockUser.lastLoginAt,
      };
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(userResponse);

      // Act & Assert
      await expect(
        service.update(mockUserId, mockOrganizationId, UserRole.ADMIN, mockRequesterId, { isActive: false })
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.update(mockUserId, mockOrganizationId, UserRole.ADMIN, mockRequesterId, { isActive: false })
      ).rejects.toThrow('No tienes permiso para cambiar el estado de usuarios');
    });

    it('debería lanzar NotFoundException si el usuario no existe', async () => {
      // Arrange
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.update(mockUserId, mockOrganizationId, UserRole.OWNER, mockRequesterId, updateDto)
      ).rejects.toThrow(NotFoundException);
    });

    it('debería permitir a OWNER actualizar solo isActive', async () => {
      // Arrange
      const userResponse = {
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        role: mockUser.role,
        isActive: mockUser.isActive,
        createdAt: mockUser.createdAt,
        updatedAt: mockUser.updatedAt,
        lastLoginAt: mockUser.lastLoginAt,
      };
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(userResponse);
      (prisma.user.update as jest.Mock).mockResolvedValue({ ...userResponse, isActive: false });

      // Act
      await service.update(mockUserId, mockOrganizationId, UserRole.OWNER, mockRequesterId, { isActive: false });

      // Assert
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUserId },
        data: {
          role: undefined,
          isActive: false,
        },
        select: expect.any(Object),
      });
    });
  });

  // ============================================================================
  // REMOVE TESTS
  // ============================================================================

  describe('remove', () => {
    it('debería eliminar un usuario exitosamente (soft delete)', async () => {
      // Arrange
      const userResponse = {
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        role: mockUser.role,
        isActive: mockUser.isActive,
        createdAt: mockUser.createdAt,
        updatedAt: mockUser.updatedAt,
        lastLoginAt: mockUser.lastLoginAt,
      };
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(userResponse);
      const deletedUser = {
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        deletedAt: new Date(),
      };
      (prisma.user.update as jest.Mock).mockResolvedValue(deletedUser);
      (prisma.refreshToken.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      // Act
      const result = await service.remove(mockUserId, mockOrganizationId, UserRole.OWNER, mockRequesterId);

      // Assert
      expect(result).toEqual(deletedUser);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUserId },
        data: {
          deletedAt: expect.any(Date),
          isActive: false,
        },
        select: {
          id: true,
          email: true,
          name: true,
          deletedAt: true,
        },
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        data: {
          revokedAt: expect.any(Date),
          revokedReason: 'user_deleted',
        },
      });
    });

    it('debería lanzar ForbiddenException si un ADMIN o VIEWER intenta eliminar', async () => {
      // Act & Assert
      await expect(service.remove(mockUserId, mockOrganizationId, UserRole.ADMIN, mockRequesterId)).rejects.toThrow(
        ForbiddenException
      );
      await expect(service.remove(mockUserId, mockOrganizationId, UserRole.ADMIN, mockRequesterId)).rejects.toThrow(
        'No tienes permiso para eliminar usuarios'
      );
    });

    it('debería lanzar ForbiddenException si intentas eliminarte a ti mismo', async () => {
      // Act & Assert
      await expect(service.remove(mockUserId, mockOrganizationId, UserRole.OWNER, mockUserId)).rejects.toThrow(
        ForbiddenException
      );
      await expect(service.remove(mockUserId, mockOrganizationId, UserRole.OWNER, mockUserId)).rejects.toThrow(
        'No puedes eliminarte a ti mismo'
      );
    });

    it('debería lanzar NotFoundException si el usuario no existe', async () => {
      // Arrange
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.remove(mockUserId, mockOrganizationId, UserRole.OWNER, mockRequesterId)).rejects.toThrow(
        NotFoundException
      );
    });

    it('debería invalidar todos los refresh tokens al eliminar', async () => {
      // Arrange
      const userResponse = {
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        role: mockUser.role,
        isActive: mockUser.isActive,
        createdAt: mockUser.createdAt,
        updatedAt: mockUser.updatedAt,
        lastLoginAt: mockUser.lastLoginAt,
      };
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(userResponse);
      const deletedUser = {
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        deletedAt: new Date(),
      };
      (prisma.user.update as jest.Mock).mockResolvedValue(deletedUser);
      (prisma.refreshToken.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

      // Act
      await service.remove(mockUserId, mockOrganizationId, UserRole.OWNER, mockRequesterId);

      // Assert
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        data: {
          revokedAt: expect.any(Date),
          revokedReason: 'user_deleted',
        },
      });
    });
  });
});
