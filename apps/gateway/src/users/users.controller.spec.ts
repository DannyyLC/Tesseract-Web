import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserPayload } from '../common/types/user-payload.type';
import { UserRole, PlanType } from '@workflow-automation/shared-types';

describe('UsersController', () => {
  let controller: UsersController;
  let service: jest.Mocked<UsersService>;

  const mockUser: UserPayload = {
    sub: 'user-123',
    email: 'admin@test.com',
    name: 'Admin User',
    role: UserRole.ADMIN,
    organizationId: 'org-123',
    organizationName: 'Test Org',
    plan: PlanType.PRO,
  };

  const mockUserResponse = {
    id: 'user-456',
    email: 'viewer@test.com',
    name: 'Viewer User',
    role: UserRole.VIEWER,
    isActive: true,
    createdAt: new Date(),
  };

  const mockUserDetailResponse = {
    id: 'user-456',
    email: 'viewer@test.com',
    name: 'Viewer User',
    role: UserRole.VIEWER,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
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
    const mockUsersService = {
      invite: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: mockUsersService }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    service = module.get(UsersService) as jest.Mocked<UsersService>;

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
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
      service.invite.mockResolvedValue(mockUserResponse);

      // Act
      const result = await controller.invite(mockUser, inviteDto);

      // Assert
      expect(result).toEqual(mockUserResponse);
      expect(service.invite).toHaveBeenCalledWith(mockUser.organizationId, mockUser.role, inviteDto);
    });

    it('debería pasar el organizationId y role del usuario actual', async () => {
      // Arrange
      service.invite.mockResolvedValue(mockUserResponse);

      // Act
      await controller.invite(mockUser, inviteDto);

      // Assert
      expect(service.invite).toHaveBeenCalledWith('org-123', UserRole.ADMIN, inviteDto);
    });

    it('debería permitir invitar con diferentes roles', async () => {
      // Arrange
      const adminInvite = { ...inviteDto, role: UserRole.ADMIN };
      service.invite.mockResolvedValue({ ...mockUserResponse, role: UserRole.ADMIN });

      // Act
      await controller.invite(mockUser, adminInvite);

      // Assert
      expect(service.invite).toHaveBeenCalledWith(mockUser.organizationId, mockUser.role, adminInvite);
    });
  });

  // ============================================================================
  // FIND ALL TESTS
  // ============================================================================

  describe('findAll', () => {
    it('debería listar todos los usuarios de la organización del usuario', async () => {
      // Arrange
      const mockUsers = [
        mockUserDetailResponse,
        { ...mockUserDetailResponse, id: 'user-789', email: 'user2@test.com' },
      ];
      service.findAll.mockResolvedValue(mockUsers);

      // Act
      const result = await controller.findAll(mockUser);

      // Assert
      expect(result).toEqual(mockUsers);
      expect(service.findAll).toHaveBeenCalledWith(mockUser.organizationId);
    });

    it('debería retornar array vacío si no hay usuarios', async () => {
      // Arrange
      service.findAll.mockResolvedValue([]);

      // Act
      const result = await controller.findAll(mockUser);

      // Assert
      expect(result).toEqual([]);
    });
  });

  // ============================================================================
  // FIND ONE TESTS
  // ============================================================================

  describe('findOne', () => {
    it('debería obtener un usuario específico', async () => {
      // Arrange
      const userId = 'user-456';
      service.findOne.mockResolvedValue(mockUserDetailResponse);

      // Act
      const result = await controller.findOne(mockUser, userId);

      // Assert
      expect(result).toEqual(mockUserDetailResponse);
      expect(service.findOne).toHaveBeenCalledWith(userId, mockUser.organizationId);
    });

    it('debería pasar el userId y organizationId correctamente', async () => {
      // Arrange
      const userId = 'user-456';
      service.findOne.mockResolvedValue(mockUserDetailResponse);

      // Act
      await controller.findOne(mockUser, userId);

      // Assert
      expect(service.findOne).toHaveBeenCalledWith('user-456', 'org-123');
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
      const userId = 'user-456';
      const updatedUser = { ...mockUserDetailResponse, role: UserRole.ADMIN };
      service.update.mockResolvedValue(updatedUser);

      // Act
      const result = await controller.update(mockUser, userId, updateDto);

      // Assert
      expect(result).toEqual(updatedUser);
      expect(service.update).toHaveBeenCalledWith(userId, mockUser.organizationId, mockUser.role, mockUser.sub, updateDto);
    });

    it('debería pasar userId, organizationId, role y requesterId correctamente', async () => {
      // Arrange
      const userId = 'user-456';
      service.update.mockResolvedValue(mockUserDetailResponse);

      // Act
      await controller.update(mockUser, userId, updateDto);

      // Assert
      expect(service.update).toHaveBeenCalledWith('user-456', 'org-123', UserRole.ADMIN, 'user-123', updateDto);
    });

    it('debería permitir actualizaciones parciales', async () => {
      // Arrange
      const userId = 'user-456';
      const partialUpdate = { isActive: false };
      service.update.mockResolvedValue({ ...mockUserDetailResponse, isActive: false });

      // Act
      await controller.update(mockUser, userId, partialUpdate);

      // Assert
      expect(service.update).toHaveBeenCalledWith(userId, mockUser.organizationId, mockUser.role, mockUser.sub, partialUpdate);
    });
  });

  // ============================================================================
  // REMOVE TESTS
  // ============================================================================

  describe('remove', () => {
    it('debería eliminar un usuario exitosamente', async () => {
      // Arrange
      const userId = 'user-456';
      const deletedUser = {
        id: 'user-456',
        email: 'viewer@test.com',
        name: 'Viewer User',
        deletedAt: new Date(),
      };
      service.remove.mockResolvedValue(deletedUser);

      // Act
      const result = await controller.remove(mockUser, userId);

      // Assert
      expect(result).toEqual(deletedUser);
      expect(service.remove).toHaveBeenCalledWith(userId, mockUser.organizationId, mockUser.role, mockUser.sub);
    });

    it('debería pasar userId, organizationId, role y requesterId correctamente', async () => {
      // Arrange
      const userId = 'user-456';
      const deletedUser = {
        id: 'user-456',
        email: 'viewer@test.com',
        name: 'Viewer User',
        deletedAt: new Date(),
      };
      service.remove.mockResolvedValue(deletedUser);

      // Act
      await controller.remove(mockUser, userId);

      // Assert
      expect(service.remove).toHaveBeenCalledWith('user-456', 'org-123', UserRole.ADMIN, 'user-123');
    });
  });

  // ============================================================================
  // AUTHORIZATION TESTS
  // ============================================================================

  describe('Authorization', () => {
    it('debería tener @Roles(OWNER, ADMIN) en el endpoint invite', () => {
      const metadata = Reflect.getMetadata('roles', controller.invite);
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
  });
});
