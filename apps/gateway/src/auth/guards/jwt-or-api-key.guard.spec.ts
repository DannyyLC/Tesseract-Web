import { Test, TestingModule } from '@nestjs/testing';
import {
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtOrApiKeyGuard } from './jwt-or-api-key.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ApiKeyGuard } from './api-key.guard';

describe('JwtOrApiKeyGuard', () => {
  let guard: JwtOrApiKeyGuard;
  let jwtAuthGuard: jest.Mocked<JwtAuthGuard>;
  let apiKeyGuard: jest.Mocked<ApiKeyGuard>;

  const mockAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';
  const mockApiKey = 'ak_live_test1234567890abcdefghijklmno';

  // Mock request
  const createMockRequest = (headers: any = {}, cookies: any = {}) => ({
    headers,
    cookies,
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
    const mockJwtAuthGuard = {
      canActivate: jest.fn(),
    };

    const mockApiKeyGuard = {
      canActivate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtOrApiKeyGuard,
        { provide: JwtAuthGuard, useValue: mockJwtAuthGuard },
        { provide: ApiKeyGuard, useValue: mockApiKeyGuard },
      ],
    }).compile();

    guard = module.get<JwtOrApiKeyGuard>(JwtOrApiKeyGuard);
    jwtAuthGuard = module.get(JwtAuthGuard) as jest.Mocked<JwtAuthGuard>;
    apiKeyGuard = module.get(ApiKeyGuard) as jest.Mocked<ApiKeyGuard>;

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  // ============================================================================
  // API KEY AUTHENTICATION TESTS
  // ============================================================================

  describe('API Key Authentication', () => {
    it('debería autenticar exitosamente con X-API-Key header', async () => {
      // Arrange
      const request = createMockRequest({ 'x-api-key': mockApiKey });
      const context = createMockContext(request);

      apiKeyGuard.canActivate.mockResolvedValue(true);

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
      expect(apiKeyGuard.canActivate).toHaveBeenCalledWith(context);
      expect(jwtAuthGuard.canActivate).not.toHaveBeenCalled();
    });

    it('debería autenticar exitosamente con Authorization Bearer ak_', async () => {
      // Arrange
      const request = createMockRequest({
        authorization: `Bearer ${mockApiKey}`,
      });
      const context = createMockContext(request);

      apiKeyGuard.canActivate.mockResolvedValue(true);

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
      expect(apiKeyGuard.canActivate).toHaveBeenCalledWith(context);
      expect(jwtAuthGuard.canActivate).not.toHaveBeenCalled();
    });

    it('debería intentar JWT si API Key falla', async () => {
      // Arrange
      const request = createMockRequest({ 'x-api-key': mockApiKey });
      const context = createMockContext(request);

      apiKeyGuard.canActivate.mockRejectedValue(
        new UnauthorizedException('Invalid API Key'),
      );
      jwtAuthGuard.canActivate.mockResolvedValue(true);

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
      expect(apiKeyGuard.canActivate).toHaveBeenCalled();
      expect(jwtAuthGuard.canActivate).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // JWT AUTHENTICATION TESTS
  // ============================================================================

  describe('JWT Authentication', () => {
    it('debería autenticar exitosamente con JWT cookie', async () => {
      // Arrange
      const request = createMockRequest({}, { accessToken: mockAccessToken });
      const context = createMockContext(request);

      jwtAuthGuard.canActivate.mockResolvedValue(true);

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
      expect(apiKeyGuard.canActivate).not.toHaveBeenCalled();
      expect(jwtAuthGuard.canActivate).toHaveBeenCalledWith(context);
    });

    it('debería autenticar con JWT si no hay API Key en headers', async () => {
      // Arrange
      const request = createMockRequest({}, { accessToken: mockAccessToken });
      const context = createMockContext(request);

      jwtAuthGuard.canActivate.mockResolvedValue(true);

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
      expect(jwtAuthGuard.canActivate).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // PRIORITY AND FALLBACK TESTS
  // ============================================================================

  describe('Priority and Fallback', () => {
    it('debería intentar API Key primero si está presente', async () => {
      // Arrange
      const request = createMockRequest({ 'x-api-key': mockApiKey });
      const context = createMockContext(request);

      apiKeyGuard.canActivate.mockResolvedValue(true);
      jwtAuthGuard.canActivate.mockResolvedValue(true);

      // Act
      await guard.canActivate(context);

      // Assert
      expect(apiKeyGuard.canActivate).toHaveBeenCalled();
      expect(jwtAuthGuard.canActivate).not.toHaveBeenCalled();
    });

    it('debería intentar JWT si API Key está presente pero falla', async () => {
      // Arrange
      const request = createMockRequest({ 'x-api-key': 'invalid-key' });
      const context = createMockContext(request);

      apiKeyGuard.canActivate.mockRejectedValue(new UnauthorizedException());
      jwtAuthGuard.canActivate.mockResolvedValue(true);

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
      expect(apiKeyGuard.canActivate).toHaveBeenCalled();
      expect(jwtAuthGuard.canActivate).toHaveBeenCalled();
    });

    it('debería lanzar UnauthorizedException si ambos fallan', async () => {
      // Arrange
      const request = createMockRequest({ 'x-api-key': 'invalid-key' });
      const context = createMockContext(request);

      apiKeyGuard.canActivate.mockRejectedValue(new UnauthorizedException());
      jwtAuthGuard.canActivate.mockRejectedValue(new UnauthorizedException());

      // Act & Assert
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Se requiere autenticación válida (JWT o API Key)',
      );
    });

    it('debería lanzar UnauthorizedException si no hay credenciales', async () => {
      // Arrange
      const request = createMockRequest({}, {});
      const context = createMockContext(request);

      jwtAuthGuard.canActivate.mockRejectedValue(new UnauthorizedException());

      // Act & Assert
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ============================================================================
  // API KEY DETECTION TESTS
  // ============================================================================

  describe('API Key Detection', () => {
    it('debería detectar API Key en X-API-Key header', async () => {
      // Arrange
      const request = createMockRequest({ 'x-api-key': mockApiKey });
      const context = createMockContext(request);

      apiKeyGuard.canActivate.mockResolvedValue(true);

      // Act
      await guard.canActivate(context);

      // Assert
      expect(apiKeyGuard.canActivate).toHaveBeenCalled();
    });

    it('debería detectar API Key en Authorization Bearer ak_', async () => {
      // Arrange
      const request = createMockRequest({
        authorization: 'Bearer ak_live_test123',
      });
      const context = createMockContext(request);

      apiKeyGuard.canActivate.mockResolvedValue(true);

      // Act
      await guard.canActivate(context);

      // Assert
      expect(apiKeyGuard.canActivate).toHaveBeenCalled();
    });

    it('NO debería detectar API Key en Authorization Bearer sin ak_', async () => {
      // Arrange
      const request = createMockRequest({
        authorization: `Bearer ${mockAccessToken}`,
      });
      const context = createMockContext(request);

      jwtAuthGuard.canActivate.mockResolvedValue(true);

      // Act
      await guard.canActivate(context);

      // Assert
      expect(apiKeyGuard.canActivate).not.toHaveBeenCalled();
      expect(jwtAuthGuard.canActivate).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('Edge Cases', () => {
    it('debería manejar API Key que retorna false', async () => {
      // Arrange
      const request = createMockRequest({ 'x-api-key': mockApiKey });
      const context = createMockContext(request);

      apiKeyGuard.canActivate.mockResolvedValue(false);
      jwtAuthGuard.canActivate.mockResolvedValue(true);

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
      expect(jwtAuthGuard.canActivate).toHaveBeenCalled();
    });

    it('debería manejar JWT que retorna false', async () => {
      // Arrange
      const request = createMockRequest({}, {});
      const context = createMockContext(request);

      jwtAuthGuard.canActivate.mockResolvedValue(false);

      // Act & Assert
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('debería manejar headers undefined', async () => {
      // Arrange
      const request = { headers: undefined };
      const context = createMockContext(request);

      jwtAuthGuard.canActivate.mockResolvedValue(true);

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });
  });

  // ============================================================================
  // LOGGING TESTS
  // ============================================================================

  describe('Logging', () => {
    it('debería loguear cuando se autentica vía API Key', async () => {
      // Arrange
      const request = createMockRequest({ 'x-api-key': mockApiKey });
      const context = createMockContext(request);
      const debugSpy = jest.spyOn(Logger.prototype, 'debug');

      apiKeyGuard.canActivate.mockResolvedValue(true);

      // Act
      await guard.canActivate(context);

      // Assert
      expect(debugSpy).toHaveBeenCalledWith('Autenticado vía API Key');
    });

    it('debería loguear cuando se autentica vía JWT', async () => {
      // Arrange
      const request = createMockRequest({}, { accessToken: mockAccessToken });
      const context = createMockContext(request);
      const debugSpy = jest.spyOn(Logger.prototype, 'debug');

      jwtAuthGuard.canActivate.mockResolvedValue(true);

      // Act
      await guard.canActivate(context);

      // Assert
      expect(debugSpy).toHaveBeenCalledWith('Autenticado vía JWT');
    });

    it('debería loguear cuando API Key falla e intenta JWT', async () => {
      // Arrange
      const request = createMockRequest({ 'x-api-key': 'invalid' });
      const context = createMockContext(request);
      const debugSpy = jest.spyOn(Logger.prototype, 'debug');

      apiKeyGuard.canActivate.mockRejectedValue(new UnauthorizedException());
      jwtAuthGuard.canActivate.mockResolvedValue(true);

      // Act
      await guard.canActivate(context);

      // Assert
      expect(debugSpy).toHaveBeenCalledWith('API Key falló, intentando JWT...');
    });
  });
});
