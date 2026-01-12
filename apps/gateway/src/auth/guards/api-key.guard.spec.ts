import { Test, TestingModule } from '@nestjs/testing';
import {
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { PrismaService } from '../../database/prisma.service';
import { ApiKeyUtil } from '../utils/api-key.util';
import { PlanType } from '@workflow-automation/shared-types';

// Mock ApiKeyUtil
jest.mock('../utils/api-key.util');

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let prisma: jest.Mocked<PrismaService>;

  const mockApiKey = 'ak_live_test1234567890abcdefghijklmno';
  const mockPrefix = mockApiKey.substring(0, 16); // 'ak_live_test1234'
  const mockKeyHash = '$2b$10$hashedapikey';

  const mockOrganization = {
    id: 'org-123',
    name: 'Test Organization',
    slug: 'test-org',
    plan: PlanType.PRO,
    isActive: true,
    deletedAt: null,
  };

  const mockApiKeyRecord = {
    id: 'api-key-123',
    name: 'Production API Key',
    keyPrefix: mockPrefix,
    keyHash: mockKeyHash,
    isActive: true,
    deletedAt: null,
    scopes: ['workflows:read', 'workflows:execute'],
    organization: mockOrganization,
  };

  // Mock request
  const createMockRequest = (headers: any = {}): any => ({
    headers,
    cookies: {},
    apiKey: undefined,
  });

  // Mock ExecutionContext
  const createMockContext = (request: any): ExecutionContext => ({
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue(request),
    }),
    getClass: jest.fn(),
    getHandler: jest.fn(),
    getArgs: jest.fn(),
    getArgByIndex: jest.fn(),
    switchToRpc: jest.fn(),
    switchToWs: jest.fn(),
    getType: jest.fn(),
  });

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
      apiKey: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyGuard,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    guard = module.get<ApiKeyGuard>(ApiKeyGuard);
    prisma = module.get(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  // ============================================================================
  // API KEY EXTRACTION TESTS
  // ============================================================================

  describe('API Key Extraction', () => {
    it('debería extraer API key del header X-API-Key', async () => {
      // Arrange
      const request = createMockRequest({ 'x-api-key': mockApiKey });
      const context = createMockContext(request);

      (prisma.apiKey.findMany as jest.Mock).mockResolvedValue([
        mockApiKeyRecord,
      ]);
      (ApiKeyUtil.compare as jest.Mock).mockResolvedValue(true);
      (prisma.apiKey.update as jest.Mock).mockResolvedValue(mockApiKeyRecord);

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
      expect(prisma.apiKey.findMany).toHaveBeenCalled();
    });

    it('debería extraer API key del header Authorization Bearer', async () => {
      // Arrange
      const request = createMockRequest({
        authorization: `Bearer ${mockApiKey}`,
      });
      const context = createMockContext(request);

      (prisma.apiKey.findMany as jest.Mock).mockResolvedValue([
        mockApiKeyRecord,
      ]);
      (ApiKeyUtil.compare as jest.Mock).mockResolvedValue(true);
      (prisma.apiKey.update as jest.Mock).mockResolvedValue(mockApiKeyRecord);

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
      expect(prisma.apiKey.findMany).toHaveBeenCalled();
    });

    it('debería lanzar UnauthorizedException si no hay API key', async () => {
      // Arrange
      const request = createMockRequest({});
      const context = createMockContext(request);

      // Act & Assert
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        'API key requerida',
      );
    });
  });

  // ============================================================================
  // API KEY VALIDATION TESTS
  // ============================================================================

  describe('API Key Validation', () => {
    it('debería validar API key exitosamente', async () => {
      // Arrange
      const request = createMockRequest({ 'x-api-key': mockApiKey });
      const context = createMockContext(request);

      (prisma.apiKey.findMany as jest.Mock).mockResolvedValue([
        mockApiKeyRecord,
      ]);
      (ApiKeyUtil.compare as jest.Mock).mockResolvedValue(true);
      (prisma.apiKey.update as jest.Mock).mockResolvedValue(mockApiKeyRecord);

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
      expect(prisma.apiKey.findMany).toHaveBeenCalledWith({
        where: {
          keyPrefix: mockPrefix,
          isActive: true,
          deletedAt: null,
        },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
              plan: true,
              isActive: true,
              deletedAt: true,
            },
          },
        },
      });
      expect(ApiKeyUtil.compare).toHaveBeenCalledWith(mockApiKey, mockKeyHash);
    });

    it('debería lanzar UnauthorizedException si no hay candidatos con el prefijo', async () => {
      // Arrange
      const request = createMockRequest({ 'x-api-key': mockApiKey });
      const context = createMockContext(request);

      (prisma.apiKey.findMany as jest.Mock).mockResolvedValue([]);

      // Act & Assert
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        'API key inválido',
      );
    });

    it('debería lanzar UnauthorizedException si el hash no coincide', async () => {
      // Arrange
      const request = createMockRequest({ 'x-api-key': mockApiKey });
      const context = createMockContext(request);

      (prisma.apiKey.findMany as jest.Mock).mockResolvedValue([
        mockApiKeyRecord,
      ]);
      (ApiKeyUtil.compare as jest.Mock).mockResolvedValue(false);

      // Act & Assert
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        'API key inválido',
      );
    });

    it('debería comparar múltiples candidatos hasta encontrar match', async () => {
      // Arrange
      const request = createMockRequest({ 'x-api-key': mockApiKey });
      const context = createMockContext(request);

      const candidate1 = { ...mockApiKeyRecord, id: 'key-1', keyHash: 'hash1' };
      const candidate2 = { ...mockApiKeyRecord, id: 'key-2', keyHash: 'hash2' };
      const candidate3 = { ...mockApiKeyRecord, id: 'key-3', keyHash: 'hash3' };

      (prisma.apiKey.findMany as jest.Mock).mockResolvedValue([
        candidate1,
        candidate2,
        candidate3,
      ]);
      (ApiKeyUtil.compare as jest.Mock)
        .mockResolvedValueOnce(false) // Candidate 1 fails
        .mockResolvedValueOnce(false) // Candidate 2 fails
        .mockResolvedValueOnce(true); // Candidate 3 matches
      (prisma.apiKey.update as jest.Mock).mockResolvedValue(candidate3);

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
      expect(ApiKeyUtil.compare).toHaveBeenCalledTimes(3);
      expect(request.apiKey).toEqual({
        apiKeyId: 'key-3',
        apiKeyName: mockApiKeyRecord.name,
        organizationId: mockOrganization.id,
        organizationName: mockOrganization.name,
        plan: mockOrganization.plan,
        scopes: mockApiKeyRecord.scopes,
      });
    });
  });

  // ============================================================================
  // ORGANIZATION VALIDATION TESTS
  // ============================================================================

  describe('Organization Validation', () => {
    it('debería lanzar UnauthorizedException si API key no tiene organización', async () => {
      // Arrange
      const request = createMockRequest({ 'x-api-key': mockApiKey });
      const context = createMockContext(request);

      const apiKeyWithoutOrg = { ...mockApiKeyRecord, organization: null };
      (prisma.apiKey.findMany as jest.Mock).mockResolvedValue([
        apiKeyWithoutOrg,
      ]);
      (ApiKeyUtil.compare as jest.Mock).mockResolvedValue(true);

      // Act & Assert
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        'API key sin organización',
      );
    });

    it('debería lanzar UnauthorizedException si la organización está inactiva', async () => {
      // Arrange
      const request = createMockRequest({ 'x-api-key': mockApiKey });
      const context = createMockContext(request);

      const inactiveOrg = { ...mockOrganization, isActive: false };
      const apiKeyWithInactiveOrg = {
        ...mockApiKeyRecord,
        organization: inactiveOrg,
      };

      (prisma.apiKey.findMany as jest.Mock).mockResolvedValue([
        apiKeyWithInactiveOrg,
      ]);
      (ApiKeyUtil.compare as jest.Mock).mockResolvedValue(true);

      // Act & Assert
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Organización inactiva',
      );
    });

    it('debería lanzar UnauthorizedException si la organización está eliminada', async () => {
      // Arrange
      const request = createMockRequest({ 'x-api-key': mockApiKey });
      const context = createMockContext(request);

      const deletedOrg = { ...mockOrganization, deletedAt: new Date() };
      const apiKeyWithDeletedOrg = {
        ...mockApiKeyRecord,
        organization: deletedOrg,
      };

      (prisma.apiKey.findMany as jest.Mock).mockResolvedValue([
        apiKeyWithDeletedOrg,
      ]);
      (ApiKeyUtil.compare as jest.Mock).mockResolvedValue(true);

      // Act & Assert
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Organización eliminada',
      );
    });
  });

  // ============================================================================
  // REQUEST INJECTION TESTS
  // ============================================================================

  describe('Request Injection', () => {
    it('debería inyectar ApiKeyPayload en el request', async () => {
      // Arrange
      const request = createMockRequest({ 'x-api-key': mockApiKey });
      const context = createMockContext(request);

      (prisma.apiKey.findMany as jest.Mock).mockResolvedValue([
        mockApiKeyRecord,
      ]);
      (ApiKeyUtil.compare as jest.Mock).mockResolvedValue(true);
      (prisma.apiKey.update as jest.Mock).mockResolvedValue(mockApiKeyRecord);

      // Act
      await guard.canActivate(context);

      // Assert
      expect(request.apiKey).toEqual({
        apiKeyId: mockApiKeyRecord.id,
        apiKeyName: mockApiKeyRecord.name,
        organizationId: mockOrganization.id,
        organizationName: mockOrganization.name,
        plan: mockOrganization.plan,
        scopes: mockApiKeyRecord.scopes,
      });
    });

    it('debería actualizar lastUsedAt del API key', async () => {
      // Arrange
      const request = createMockRequest({ 'x-api-key': mockApiKey });
      const context = createMockContext(request);

      (prisma.apiKey.findMany as jest.Mock).mockResolvedValue([
        mockApiKeyRecord,
      ]);
      (ApiKeyUtil.compare as jest.Mock).mockResolvedValue(true);
      (prisma.apiKey.update as jest.Mock).mockResolvedValue(mockApiKeyRecord);

      // Act
      await guard.canActivate(context);

      // Assert
      expect(prisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: mockApiKeyRecord.id },
        data: { lastUsedAt: expect.any(Date) },
      });
    });

    it('no debería fallar si actualizar lastUsedAt falla', async () => {
      // Arrange
      const request = createMockRequest({ 'x-api-key': mockApiKey });
      const context = createMockContext(request);

      (prisma.apiKey.findMany as jest.Mock).mockResolvedValue([
        mockApiKeyRecord,
      ]);
      (ApiKeyUtil.compare as jest.Mock).mockResolvedValue(true);
      (prisma.apiKey.update as jest.Mock).mockRejectedValue(
        new Error('DB error'),
      );

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });
  });

  // ============================================================================
  // ERROR HANDLING TESTS
  // ============================================================================

  describe('Error Handling', () => {
    it('debería re-lanzar UnauthorizedException', async () => {
      // Arrange
      const request = createMockRequest({ 'x-api-key': mockApiKey });
      const context = createMockContext(request);

      (prisma.apiKey.findMany as jest.Mock).mockResolvedValue([]);

      // Act & Assert
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('debería convertir errores desconocidos en UnauthorizedException', async () => {
      // Arrange
      const request = createMockRequest({ 'x-api-key': mockApiKey });
      const context = createMockContext(request);

      (prisma.apiKey.findMany as jest.Mock).mockRejectedValue(
        new Error('Database error'),
      );

      // Act & Assert
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Error al validar API key',
      );
    });
  });
});
