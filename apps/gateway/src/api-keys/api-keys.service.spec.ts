import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { PrismaService } from '../database/prisma.service';
import { ApiKeyUtil } from '../auth/utils/api-key.util';
import { PlanType } from '@workflow-automation/shared-types';

// Mock ApiKeyUtil
jest.mock('../auth/utils/api-key.util');

describe('ApiKeysService', () => {
  let service: ApiKeysService;
  let prisma: jest.Mocked<PrismaService>;

  const mockOrganizationId = 'org-123';
  const mockApiKeyId = 'api-key-123';
  const mockGeneratedApiKey = 'ak_live_test1234567890abcdefghijklmno';
  const mockKeyPrefix = 'ak_live_test1234';
  const mockKeyHash = '$2b$10$hashedapikey';

  const mockOrganization = {
    id: mockOrganizationId,
    name: 'Test Org',
    slug: 'test-org',
    plan: PlanType.PRO,
    _count: { apiKeys: 1 },
  };

  const mockApiKey = {
    id: mockApiKeyId,
    name: 'Production API Key',
    description: 'API Key for production',
    keyHash: mockKeyHash,
    keyPrefix: mockKeyPrefix,
    organizationId: mockOrganizationId,
    scopes: ['workflows:read', 'workflows:execute'],
    expiresAt: null,
    isActive: true,
    lastUsedAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
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
    const mockPrismaService = {
      organization: {
        findUnique: jest.fn(),
      },
      apiKey: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ApiKeysService>(ApiKeysService);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;

    // Setup ApiKeyUtil mocks
    (ApiKeyUtil.generate as jest.Mock).mockReturnValue(mockGeneratedApiKey);
    (ApiKeyUtil.extractPrefix as jest.Mock).mockReturnValue(mockKeyPrefix);
    (ApiKeyUtil.hash as jest.Mock).mockResolvedValue(mockKeyHash);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================================================
  // CREATE TESTS
  // ============================================================================

  describe('create', () => {
    const createDto = {
      name: 'Test API Key',
      description: 'Test description',
      scopes: ['workflows:read'],
      expiresAt: undefined,
    };

    it('debería crear un API key exitosamente', async () => {
      // Arrange
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue(mockOrganization);
      (prisma.apiKey.create as jest.Mock).mockResolvedValue(mockApiKey);

      // Act
      const result = await service.create(mockOrganizationId, createDto);

      // Assert
      expect(result).toEqual({
        id: mockApiKey.id,
        name: mockApiKey.name,
        description: mockApiKey.description,
        apiKey: mockGeneratedApiKey, // El API key en texto plano
        keyPrefix: mockKeyPrefix,
        isActive: true,
        scopes: mockApiKey.scopes,
        expiresAt: null,
        createdAt: mockApiKey.createdAt,
      });

      expect(prisma.organization.findUnique).toHaveBeenCalledWith({
        where: { id: mockOrganizationId },
        include: { _count: { select: { apiKeys: true } } },
      });

      expect(ApiKeyUtil.generate).toHaveBeenCalledWith('live');
      expect(ApiKeyUtil.extractPrefix).toHaveBeenCalledWith(mockGeneratedApiKey);
      expect(ApiKeyUtil.hash).toHaveBeenCalledWith(mockGeneratedApiKey);

      expect(prisma.apiKey.create).toHaveBeenCalledWith({
        data: {
          name: createDto.name,
          description: createDto.description,
          keyHash: mockKeyHash,
          keyPrefix: mockKeyPrefix,
          organizationId: mockOrganizationId,
          scopes: createDto.scopes,
          expiresAt: undefined,
          isActive: true,
        },
      });
    });

    it('debería lanzar NotFoundException si la organización no existe', async () => {
      // Arrange
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.create(mockOrganizationId, createDto)).rejects.toThrow(NotFoundException);
      await expect(service.create(mockOrganizationId, createDto)).rejects.toThrow('Organización no encontrada');
    });

    it('debería lanzar BadRequestException si se alcanza el límite de API keys', async () => {
      // Arrange
      const orgAtLimit = {
        ...mockOrganization,
        plan: PlanType.FREE,
        _count: { apiKeys: 2 }, // FREE plan limit is 2
      };
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue(orgAtLimit);

      // Act & Assert
      await expect(service.create(mockOrganizationId, createDto)).rejects.toThrow(BadRequestException);
      await expect(service.create(mockOrganizationId, createDto)).rejects.toThrow(
        'Has alcanzado el límite de 2 API Keys para tu plan free'
      );
    });

    it('NO debería lanzar error si el plan permite API keys ilimitadas', async () => {
      // Arrange
      const orgUnlimited = {
        ...mockOrganization,
        plan: PlanType.ENTERPRISE,
        _count: { apiKeys: 100 },
      };
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue(orgUnlimited);
      (prisma.apiKey.create as jest.Mock).mockResolvedValue(mockApiKey);

      // Act
      const result = await service.create(mockOrganizationId, createDto);

      // Assert
      expect(result).toBeDefined();
      expect(result.apiKey).toBe(mockGeneratedApiKey);
    });

    it('debería manejar fecha de expiración correctamente', async () => {
      // Arrange
      const dtoWithExpiry = {
        ...createDto,
        expiresAt: '2025-12-31T23:59:59Z',
      };
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue(mockOrganization);
      (prisma.apiKey.create as jest.Mock).mockResolvedValue(mockApiKey);

      // Act
      await service.create(mockOrganizationId, dtoWithExpiry);

      // Assert
      expect(prisma.apiKey.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          expiresAt: new Date(dtoWithExpiry.expiresAt),
        }),
      });
    });
  });

  // ============================================================================
  // FIND ALL TESTS
  // ============================================================================

  describe('findAll', () => {
    it('debería listar todos los API keys de una organización', async () => {
      // Arrange
      const apiKeys = [mockApiKey, { ...mockApiKey, id: 'api-key-456' }];
      (prisma.apiKey.findMany as jest.Mock).mockResolvedValue(apiKeys);

      // Act
      const result = await service.findAll(mockOrganizationId);

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0]).not.toHaveProperty('keyHash');
      expect(result[0]).not.toHaveProperty('apiKey');
      expect(result[0]).toEqual({
        id: mockApiKey.id,
        name: mockApiKey.name,
        description: mockApiKey.description,
        keyPrefix: mockKeyPrefix,
        isActive: true,
        lastUsedAt: null,
        expiresAt: null,
        scopes: mockApiKey.scopes,
        createdAt: mockApiKey.createdAt,
        updatedAt: mockApiKey.updatedAt,
      });

      expect(prisma.apiKey.findMany).toHaveBeenCalledWith({
        where: { organizationId: mockOrganizationId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('debería retornar array vacío si no hay API keys', async () => {
      // Arrange
      (prisma.apiKey.findMany as jest.Mock).mockResolvedValue([]);

      // Act
      const result = await service.findAll(mockOrganizationId);

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
      (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(mockApiKey);

      // Act
      const result = await service.findOne(mockOrganizationId, mockApiKeyId);

      // Assert
      expect(result).toEqual({
        id: mockApiKey.id,
        name: mockApiKey.name,
        description: mockApiKey.description,
        keyPrefix: mockKeyPrefix,
        isActive: true,
        lastUsedAt: null,
        expiresAt: null,
        scopes: mockApiKey.scopes,
        createdAt: mockApiKey.createdAt,
        updatedAt: mockApiKey.updatedAt,
        deletedAt: null,
      });

      expect(prisma.apiKey.findUnique).toHaveBeenCalledWith({
        where: { id: mockApiKeyId },
      });
    });

    it('debería lanzar NotFoundException si el API key no existe', async () => {
      // Arrange
      (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.findOne(mockOrganizationId, mockApiKeyId)).rejects.toThrow(NotFoundException);
      await expect(service.findOne(mockOrganizationId, mockApiKeyId)).rejects.toThrow('API Key no encontrada');
    });

    it('debería lanzar ForbiddenException si el API key pertenece a otra organización', async () => {
      // Arrange
      const otherOrgApiKey = { ...mockApiKey, organizationId: 'other-org-123' };
      (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(otherOrgApiKey);

      // Act & Assert
      await expect(service.findOne(mockOrganizationId, mockApiKeyId)).rejects.toThrow(ForbiddenException);
      await expect(service.findOne(mockOrganizationId, mockApiKeyId)).rejects.toThrow(
        'No tienes permiso para ver esta API Key'
      );
    });
  });

  // ============================================================================
  // DELETE TESTS
  // ============================================================================

  describe('delete', () => {
    it('debería eliminar un API key exitosamente (soft delete)', async () => {
      // Arrange
      (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(mockApiKey);
      (prisma.apiKey.update as jest.Mock).mockResolvedValue({ ...mockApiKey, deletedAt: new Date(), isActive: false });

      // Act
      const result = await service.delete(mockOrganizationId, mockApiKeyId);

      // Assert
      expect(result).toEqual({
        success: true,
        message: 'API Key eliminada exitosamente',
      });

      expect(prisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: mockApiKeyId },
        data: { deletedAt: expect.any(Date), isActive: false },
      });
    });

    it('debería lanzar NotFoundException si el API key no existe', async () => {
      // Arrange
      (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.delete(mockOrganizationId, mockApiKeyId)).rejects.toThrow(NotFoundException);
    });

    it('debería lanzar ForbiddenException si el API key pertenece a otra organización', async () => {
      // Arrange
      const otherOrgApiKey = { ...mockApiKey, organizationId: 'other-org-123' };
      (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(otherOrgApiKey);

      // Act & Assert
      await expect(service.delete(mockOrganizationId, mockApiKeyId)).rejects.toThrow(ForbiddenException);
      await expect(service.delete(mockOrganizationId, mockApiKeyId)).rejects.toThrow(
        'No tienes permiso para eliminar esta API Key'
      );
    });

    it('debería lanzar ForbiddenException si el API key ya está eliminado', async () => {
      // Arrange
      const deletedApiKey = { ...mockApiKey, deletedAt: new Date() };
      (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(deletedApiKey);

      // Act & Assert
      await expect(service.delete(mockOrganizationId, mockApiKeyId)).rejects.toThrow(ForbiddenException);
      await expect(service.delete(mockOrganizationId, mockApiKeyId)).rejects.toThrow(
        'Esta API Key ya fue eliminada'
      );
    });
  });

  // ============================================================================
  // UPDATE TESTS
  // ============================================================================

  describe('update', () => {
    const updateDto = {
      name: 'Updated Name',
      description: 'Updated description',
      isActive: false,
    };

    it('debería actualizar un API key exitosamente', async () => {
      // Arrange
      (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(mockApiKey);
      const updatedApiKey = { ...mockApiKey, ...updateDto };
      (prisma.apiKey.update as jest.Mock).mockResolvedValue(updatedApiKey);

      // Act
      const result = await service.update(mockOrganizationId, mockApiKeyId, updateDto);

      // Assert
      expect(result.success).toBe(true);
      expect(result.message).toBe('API Key actualizada exitosamente');
      expect(result.apiKey.name).toBe(updateDto.name);
      expect(result.apiKey.description).toBe(updateDto.description);
      expect(result.apiKey.isActive).toBe(updateDto.isActive);

      expect(prisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: mockApiKeyId },
        data: updateDto,
      });
    });

    it('debería actualizar solo el nombre si es lo único proporcionado', async () => {
      // Arrange
      const partialUpdate = { name: 'Only Name Updated' };
      (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(mockApiKey);
      (prisma.apiKey.update as jest.Mock).mockResolvedValue({ ...mockApiKey, ...partialUpdate });

      // Act
      await service.update(mockOrganizationId, mockApiKeyId, partialUpdate);

      // Assert
      expect(prisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: mockApiKeyId },
        data: partialUpdate,
      });
    });

    it('debería lanzar BadRequestException si no se proporcionan campos para actualizar', async () => {
      // Arrange
      (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(mockApiKey);

      // Act & Assert
      await expect(service.update(mockOrganizationId, mockApiKeyId, {})).rejects.toThrow(BadRequestException);
      await expect(service.update(mockOrganizationId, mockApiKeyId, {})).rejects.toThrow(
        'No se proporcionaron campos para actualizar'
      );
    });

    it('debería lanzar NotFoundException si el API key no existe', async () => {
      // Arrange
      (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.update(mockOrganizationId, mockApiKeyId, updateDto)).rejects.toThrow(NotFoundException);
    });

    it('debería lanzar ForbiddenException si el API key pertenece a otra organización', async () => {
      // Arrange
      const otherOrgApiKey = { ...mockApiKey, organizationId: 'other-org-123' };
      (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(otherOrgApiKey);

      // Act & Assert
      await expect(service.update(mockOrganizationId, mockApiKeyId, updateDto)).rejects.toThrow(ForbiddenException);
    });

    it('debería lanzar ForbiddenException si el API key está eliminado', async () => {
      // Arrange
      const deletedApiKey = { ...mockApiKey, deletedAt: new Date() };
      (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(deletedApiKey);

      // Act & Assert
      await expect(service.update(mockOrganizationId, mockApiKeyId, updateDto)).rejects.toThrow(ForbiddenException);
      await expect(service.update(mockOrganizationId, mockApiKeyId, updateDto)).rejects.toThrow(
        'No puedes modificar una API Key eliminada'
      );
    });
  });
});
