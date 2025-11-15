import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { UserPayload } from '../common/types/jwt-payload.type';
import { PlanType } from '@workflow-automation/shared-types';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

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

  // Mock data
  const mockUserId = 'user-123';
  const mockOrgId = 'org-456';
  const mockEmail = 'test@example.com';
  const mockName = 'Test User';
  const mockAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.access';
  const mockRefreshToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.refresh';

  const mockAuthResult = {
    user: {
      id: mockUserId,
      email: mockEmail,
      name: mockName,
      role: 'owner',
    },
    organization: {
      id: mockOrgId,
      name: 'Test Organization',
      slug: 'test-organization',
      plan: PlanType.FREE,
    },
    accessToken: mockAccessToken,
    refreshToken: mockRefreshToken,
  };

  const mockUserPayload: UserPayload = {
    sub: mockUserId,
    email: mockEmail,
    name: mockName,
    role: 'owner',
    organizationId: mockOrgId,
    organizationName: 'Test Organization',
    plan: PlanType.FREE,
  };

  const mockResponse = {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  } as unknown as Response;

  const mockRequest = {
    cookies: {
      refreshToken: mockRefreshToken,
    },
  } as unknown as Request;

  beforeEach(async () => {
    const mockAuthService = {
      register: jest.fn(),
      login: jest.fn(),
      refreshTokens: jest.fn(),
      logout: jest.fn(),
      logoutAll: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);

    // Limpiar mocks antes de cada test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ============================================================================
  // LOGIN TESTS
  // ============================================================================

  describe('login', () => {
    const loginDto = {
      email: mockEmail,
      password: 'SecurePass123!',
    };

    it('debería hacer login exitosamente y establecer cookies', async () => {
      // Arrange
      authService.login.mockResolvedValue(mockAuthResult);

      // Act
      const result = await controller.login(loginDto, mockResponse);

      // Assert
      expect(authService.login).toHaveBeenCalledWith(loginDto);
      expect(result).toEqual({
        user: mockAuthResult.user,
      });
      expect(mockResponse.cookie).toHaveBeenCalledTimes(2);
      expect(mockResponse.cookie).toHaveBeenCalledWith('accessToken', mockAccessToken, {
        httpOnly: true,
        secure: false, // NODE_ENV !== 'production' in tests
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000,
        path: '/',
      });
      expect(mockResponse.cookie).toHaveBeenCalledWith('refreshToken', mockRefreshToken, {
        httpOnly: true,
        secure: false,
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/api/auth',
      });
    });

    it('debería establecer cookies seguras en producción', async () => {
      // Arrange
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      authService.login.mockResolvedValue(mockAuthResult);

      // Act
      await controller.login(loginDto, mockResponse);

      // Assert
      expect(mockResponse.cookie).toHaveBeenCalledWith('accessToken', mockAccessToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000,
        path: '/',
      });

      // Cleanup
      process.env.NODE_ENV = originalEnv;
    });

    it('debería propagar el error si login falla', async () => {
      // Arrange
      const error = new Error('Credenciales inválidas');
      authService.login.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.login(loginDto, mockResponse)).rejects.toThrow(error);
    });
  });

  // ============================================================================
  // REFRESH TESTS
  // ============================================================================

  describe('refresh', () => {
    const mockTokensResult = {
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    };

    it('debería refrescar tokens exitosamente', async () => {
      // Arrange
      authService.refreshTokens.mockResolvedValue(mockTokensResult);

      // Act
      const result = await controller.refresh(mockRequest, mockResponse);

      // Assert
      expect(authService.refreshTokens).toHaveBeenCalledWith(mockRefreshToken);
      expect(result).toEqual({ success: true });
      expect(mockResponse.cookie).toHaveBeenCalledTimes(2);
      expect(mockResponse.cookie).toHaveBeenCalledWith('accessToken', 'new-access-token', {
        httpOnly: true,
        secure: false,
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000,
        path: '/',
      });
      expect(mockResponse.cookie).toHaveBeenCalledWith('refreshToken', 'new-refresh-token', {
        httpOnly: true,
        secure: false,
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/api/auth',
      });
    });

    it('debería lanzar error si no hay refreshToken en las cookies', async () => {
      // Arrange
      const requestWithoutCookie = { cookies: {} } as unknown as Request;

      // Act & Assert
      await expect(controller.refresh(requestWithoutCookie, mockResponse)).rejects.toThrow(
        'Refresh token no encontrado en las cookies',
      );
      expect(authService.refreshTokens).not.toHaveBeenCalled();
    });

    it('debería lanzar error si cookies es undefined', async () => {
      // Arrange
      const requestWithoutCookies = {} as unknown as Request;

      // Act & Assert
      await expect(controller.refresh(requestWithoutCookies, mockResponse)).rejects.toThrow(
        'Refresh token no encontrado en las cookies',
      );
    });
  });

  // ============================================================================
  // GET PROFILE (ME) TESTS
  // ============================================================================

  describe('getProfile', () => {
    it('debería retornar el perfil del usuario autenticado', async () => {
      // Act
      const result = await controller.getProfile(mockUserPayload);

      // Assert
      expect(result).toEqual(mockUserPayload);
    });

    it('debería retornar todos los campos del payload', async () => {
      // Act
      const result = await controller.getProfile(mockUserPayload);

      // Assert
      expect(result).toHaveProperty('sub', mockUserId);
      expect(result).toHaveProperty('email', mockEmail);
      expect(result).toHaveProperty('name', mockName);
      expect(result).toHaveProperty('role', 'owner');
      expect(result).toHaveProperty('organizationId', mockOrgId);
      expect(result).toHaveProperty('organizationName', 'Test Organization');
      expect(result).toHaveProperty('plan', PlanType.FREE);
    });
  });

  // ============================================================================
  // LOGOUT TESTS
  // ============================================================================

  describe('logout', () => {
    it('debería cerrar sesión exitosamente y limpiar cookies', async () => {
      // Arrange
      authService.logout.mockResolvedValue({ message: 'Sesión cerrada exitosamente' });

      // Act
      const result = await controller.logout(mockRequest, mockResponse);

      // Assert
      expect(authService.logout).toHaveBeenCalledWith(mockRefreshToken);
      expect(result).toEqual({ message: 'Sesión cerrada exitosamente' });
      expect(mockResponse.clearCookie).toHaveBeenCalledTimes(2);
      expect(mockResponse.clearCookie).toHaveBeenCalledWith('accessToken', { path: '/' });
      expect(mockResponse.clearCookie).toHaveBeenCalledWith('refreshToken', { path: '/api/auth' });
    });

    it('debería limpiar cookies incluso si no hay refreshToken', async () => {
      // Arrange
      const requestWithoutCookie = { cookies: {} } as unknown as Request;

      // Act
      const result = await controller.logout(requestWithoutCookie, mockResponse);

      // Assert
      expect(authService.logout).not.toHaveBeenCalled();
      expect(result).toEqual({ message: 'Sesión cerrada exitosamente' });
      expect(mockResponse.clearCookie).toHaveBeenCalledTimes(2);
    });

    it('debería limpiar cookies incluso si cookies es undefined', async () => {
      // Arrange
      const requestWithoutCookies = {} as unknown as Request;

      // Act
      const result = await controller.logout(requestWithoutCookies, mockResponse);

      // Assert
      expect(authService.logout).not.toHaveBeenCalled();
      expect(mockResponse.clearCookie).toHaveBeenCalledTimes(2);
    });
  });

  // ============================================================================
  // LOGOUT ALL TESTS
  // ============================================================================

  describe('logoutAll', () => {
    it('debería cerrar sesión en todos los dispositivos y limpiar cookies', async () => {
      // Arrange
      authService.logoutAll.mockResolvedValue({
        message: 'Sesión cerrada en todos los dispositivos',
      });

      // Act
      const result = await controller.logoutAll(mockUserPayload, mockResponse);

      // Assert
      expect(authService.logoutAll).toHaveBeenCalledWith(mockUserId);
      expect(result).toEqual({ message: 'Sesión cerrada en todos los dispositivos' });
      expect(mockResponse.clearCookie).toHaveBeenCalledTimes(2);
      expect(mockResponse.clearCookie).toHaveBeenCalledWith('accessToken', { path: '/' });
      expect(mockResponse.clearCookie).toHaveBeenCalledWith('refreshToken', { path: '/api/auth' });
    });

    it('debería usar el userId del payload JWT', async () => {
      // Arrange
      const customPayload = { ...mockUserPayload, sub: 'different-user-id' };
      authService.logoutAll.mockResolvedValue({
        message: 'Sesión cerrada en todos los dispositivos',
      });

      // Act
      await controller.logoutAll(customPayload, mockResponse);

      // Assert
      expect(authService.logoutAll).toHaveBeenCalledWith('different-user-id');
    });
  });
});
