import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { UserPayload } from '../common/types/user-payload.type';
import { UserRole, PlanType } from '@workflow-automation/shared-types';

describe('ApiKeysController', () => {
  let controller: ApiKeysController;
  let service: jest.Mocked<ApiKeysService>;

  const mockUser: UserPayload = {
    sub: 'user-123',
    email: 'admin@test.com',
    name: 'Admin User',
    role: UserRole.ADMIN,
    organizationId: 'org-123',
    organizationName: 'Test Org',
    plan: PlanType.PRO,
  };

  const mockApiKey = {
    id: 'api-key-123',
    name: 'Test API Key',
    description: 'Test description',
    apiKey: 'ak_live_test1234567890abcdefghijklmno',
    keyPrefix: 'ak_live_test1234',
    isActive: true,
    scopes: ['workflows:read'],
    expiresAt: null,
    createdAt: new Date(),
  };

  const mockApiKeyListItem = {
    id: 'api-key-123',
    name: 'Test API Key',
    description: 'Test description',
    keyPrefix: 'ak_live_test1234',
    isActive: true,
    lastUsedAt: null,
    expiresAt: null,
    scopes: ['workflows:read'],
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
    const mockApiKeysService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApiKeysController],
      providers: [{ provide: ApiKeysService, useValue: mockApiKeysService }],
    }).compile();

    controller = module.get<ApiKeysController>(ApiKeysController);
    service = module.get(ApiKeysService);

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
      name: 'Test API Key',
      description: 'Test description',
      scopes: ['workflows:read'],
    };

    it('debería crear un API key exitosamente', async () => {
      // Arrange
      service.create.mockResolvedValue(mockApiKey);

      // Act
      const result = await controller.create(mockUser, createDto);

      // Assert
      expect(result).toEqual(mockApiKey);
      expect(service.create).toHaveBeenCalledWith(mockUser.organizationId, createDto);
    });

    it('debería pasar el organizationId del usuario actual', async () => {
      // Arrange
      service.create.mockResolvedValue(mockApiKey);

      // Act
      await controller.create(mockUser, createDto);

      // Assert
      expect(service.create).toHaveBeenCalledWith('org-123', createDto);
    });
  });

  // ============================================================================
  // FIND ALL TESTS
  // ============================================================================

  describe('findAll', () => {
    it('debería listar todos los API keys de la organización del usuario', async () => {
      // Arrange
      const mockApiKeys = [mockApiKeyListItem, { ...mockApiKeyListItem, id: 'api-key-456' }];
      service.findAll.mockResolvedValue(mockApiKeys);

      // Act
      const result = await controller.findAll(mockUser);

      // Assert
      expect(result).toEqual(mockApiKeys);
      expect(service.findAll).toHaveBeenCalledWith(mockUser.organizationId);
    });

    it('debería retornar array vacío si no hay API keys', async () => {
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
    it('debería obtener un API key específico', async () => {
      // Arrange
      const apiKeyId = 'api-key-123';
      service.findOne.mockResolvedValue(mockApiKeyListItem);

      // Act
      const result = await controller.findOne(mockUser, apiKeyId);

      // Assert
      expect(result).toEqual(mockApiKeyListItem);
      expect(service.findOne).toHaveBeenCalledWith(mockUser.organizationId, apiKeyId);
    });
  });

  // ============================================================================
  // DELETE TESTS
  // ============================================================================

  describe('delete', () => {
    it('debería eliminar un API key exitosamente', async () => {
      // Arrange
      const apiKeyId = 'api-key-123';
      const deleteResponse = {
        success: true,
        message: 'API Key eliminada exitosamente',
      };
      service.delete.mockResolvedValue(deleteResponse);

      // Act
      const result = await controller.delete(mockUser, apiKeyId);

      // Assert
      expect(result).toEqual(deleteResponse);
      expect(service.delete).toHaveBeenCalledWith(mockUser.organizationId, apiKeyId);
    });
  });

  // ============================================================================
  // UPDATE TESTS
  // ============================================================================

  describe('update', () => {
    const updateDto = {
      name: 'Updated Name',
      isActive: false,
    };

    it('debería actualizar un API key exitosamente', async () => {
      // Arrange
      const apiKeyId = 'api-key-123';
      const updateResponse = {
        success: true,
        apiKey: { ...mockApiKeyListItem, ...updateDto },
        message: 'API Key actualizada exitosamente',
      };
      service.update.mockResolvedValue(updateResponse);

      // Act
      const result = await controller.update(mockUser, apiKeyId, updateDto);

      // Assert
      expect(result).toEqual(updateResponse);
      expect(service.update).toHaveBeenCalledWith(mockUser.organizationId, apiKeyId, updateDto);
    });

    it('debería pasar el organizationId y params correctamente', async () => {
      // Arrange
      const apiKeyId = 'api-key-456';
      service.update.mockResolvedValue({
        success: true,
        apiKey: mockApiKeyListItem,
        message: 'API Key actualizada exitosamente',
      });

      // Act
      await controller.update(mockUser, apiKeyId, updateDto);

      // Assert
      expect(service.update).toHaveBeenCalledWith('org-123', 'api-key-456', updateDto);
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

    it('debería tener @Roles(OWNER, ADMIN) en el endpoint delete', () => {
      const metadata = Reflect.getMetadata('roles', controller.delete);
      expect(metadata).toEqual([UserRole.OWNER, UserRole.ADMIN]);
    });

    it('debería tener @Roles(OWNER, ADMIN) en el endpoint update', () => {
      const metadata = Reflect.getMetadata('roles', controller.update);
      expect(metadata).toEqual([UserRole.OWNER, UserRole.ADMIN]);
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
