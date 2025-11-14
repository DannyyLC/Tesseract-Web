import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../database/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PlanType } from '@workflow-automation/shared-types';

describe('AuthService', () => {
  let service: AuthService;
  let prismaService: jest.Mocked<PrismaService>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;

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
  const mockPassword = 'SecurePass123!';
  const mockHashedPassword = '$2b$10$hashedpassword';
  const mockAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.access';
  const mockRefreshToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.refresh';

  const mockUser = {
    id: mockUserId,
    email: mockEmail,
    name: mockName,
    password: mockHashedPassword,
    role: 'owner',
    organizationId: mockOrgId,
    isActive: true,
    emailVerified: false,
    deletedAt: null,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    twoFactorEnabled: false,
    twoFactorSecret: null,
    passwordResetToken: null,
    passwordResetExpires: null,
    emailVerificationToken: null,
    timezone: 'UTC',
  };

  const mockOrganization = {
    id: mockOrgId,
    name: 'Test Organization',
    slug: 'test-organization',
    plan: PlanType.FREE,
    maxUsers: 3,
    maxWorkflows: 5,
    maxExecutionsPerDay: 100,
    maxApiKeys: 2,
    isActive: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    stripeCustomerId: null,
    subscriptionStatus: null,
    subscriptionPeriodEnd: null,
    metadata: null,
    shardKey: null,
    region: null,
  };

  const mockRefreshTokenRecord = {
    id: 'token-123',
    tokenHash: '$2b$10$hashedrefreshtoken',
    familyId: 'family-123',
    userId: mockUserId,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    revokedAt: null,
    revokedReason: null,
    previousTokenHash: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    userAgent: null,
    ipAddress: null,
    deviceId: null,
  };

  beforeEach(async () => {
    // Crear mocks
    const mockPrismaService = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      organization: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      refreshToken: {
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const mockJwtService = {
      sign: jest.fn(),
      verify: jest.fn(),
      decode: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prismaService = module.get(PrismaService);
    jwtService = module.get(JwtService);
    configService = module.get(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================================================
  // REGISTER TESTS
  // ============================================================================

  describe('register', () => {
    const registerDto = {
      name: 'Test Organization',
      email: mockEmail,
      password: mockPassword,
    };

    it('debería registrar una nueva organización con usuario owner exitosamente', async () => {
      // Arrange
      prismaService.user.findUnique.mockResolvedValue(null);
      prismaService.organization.findUnique.mockResolvedValue(null);
      prismaService.$transaction.mockImplementation(async (callback) => {
        return callback({
          organization: { create: jest.fn().mockResolvedValue(mockOrganization) },
          user: { create: jest.fn().mockResolvedValue(mockUser) },
        });
      });
      jwtService.sign.mockReturnValueOnce(mockAccessToken).mockReturnValueOnce(mockRefreshToken);
      configService.get.mockReturnValue('7d');
      prismaService.refreshToken.create.mockResolvedValue(mockRefreshTokenRecord);

      // Act
      const result = await service.register(registerDto);

      // Assert
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('organization');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.email).toBe(mockEmail);
      expect(result.organization.name).toBe('Test Organization');
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: mockEmail },
      });
    });

    it('debería lanzar ConflictException si el email ya está registrado', async () => {
      // Arrange
      prismaService.user.findUnique.mockResolvedValue(mockUser);

      // Act & Assert
      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: mockEmail },
      });
    });

    it('debería generar slug único si el slug base ya existe', async () => {
      // Arrange
      prismaService.user.findUnique.mockResolvedValue(null);
      prismaService.organization.findUnique
        .mockResolvedValueOnce(mockOrganization) // Primera vez: slug ya existe
        .mockResolvedValueOnce(mockOrganization) // Segunda vez: slug-1 ya existe
        .mockResolvedValueOnce(null); // Tercera vez: slug-2 está disponible

      prismaService.$transaction.mockImplementation(async (callback) => {
        return callback({
          organization: { create: jest.fn().mockResolvedValue(mockOrganization) },
          user: { create: jest.fn().mockResolvedValue(mockUser) },
        });
      });
      jwtService.sign.mockReturnValueOnce(mockAccessToken).mockReturnValueOnce(mockRefreshToken);
      configService.get.mockReturnValue('7d');
      prismaService.refreshToken.create.mockResolvedValue(mockRefreshTokenRecord);

      // Act
      const result = await service.register(registerDto);

      // Assert
      expect(result).toBeDefined();
      expect(prismaService.organization.findUnique).toHaveBeenCalledTimes(3);
    });

    it('debería hashear la contraseña con bcrypt', async () => {
      // Arrange
      const bcryptHashSpy = jest.spyOn(bcrypt, 'hash');
      prismaService.user.findUnique.mockResolvedValue(null);
      prismaService.organization.findUnique.mockResolvedValue(null);
      prismaService.$transaction.mockImplementation(async (callback) => {
        return callback({
          organization: { create: jest.fn().mockResolvedValue(mockOrganization) },
          user: { create: jest.fn().mockResolvedValue(mockUser) },
        });
      });
      jwtService.sign.mockReturnValueOnce(mockAccessToken).mockReturnValueOnce(mockRefreshToken);
      configService.get.mockReturnValue('7d');
      prismaService.refreshToken.create.mockResolvedValue(mockRefreshTokenRecord);

      // Act
      await service.register(registerDto);

      // Assert
      expect(bcryptHashSpy).toHaveBeenCalledWith(mockPassword, 10);
    });
  });

  // ============================================================================
  // LOGIN TESTS
  // ============================================================================

  describe('login', () => {
    const loginDto = {
      email: mockEmail,
      password: mockPassword,
    };

    it('debería hacer login exitosamente con credenciales válidas', async () => {
      // Arrange
      const userWithOrg = { ...mockUser, organization: mockOrganization };
      prismaService.user.findUnique.mockResolvedValue(userWithOrg);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      jwtService.sign.mockReturnValueOnce(mockAccessToken).mockReturnValueOnce(mockRefreshToken);
      configService.get.mockReturnValue('7d');
      prismaService.refreshToken.create.mockResolvedValue(mockRefreshTokenRecord);
      prismaService.user.update.mockResolvedValue(mockUser);

      // Act
      const result = await service.login(loginDto);

      // Assert
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('organization');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.email).toBe(mockEmail);
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: mockUserId },
        data: { lastLoginAt: expect.any(Date) },
      });
    });

    it('debería lanzar UnauthorizedException con credenciales inválidas', async () => {
      // Arrange
      prismaService.user.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('debería lanzar UnauthorizedException si la contraseña es incorrecta', async () => {
      // Arrange
      const userWithOrg = { ...mockUser, organization: mockOrganization };
      prismaService.user.findUnique.mockResolvedValue(userWithOrg);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      // Act & Assert
      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ============================================================================
  // VALIDATE USER TESTS
  // ============================================================================

  describe('validateUser', () => {
    it('debería validar usuario correctamente con credenciales válidas', async () => {
      // Arrange
      const userWithOrg = { ...mockUser, organization: mockOrganization };
      prismaService.user.findUnique.mockResolvedValue(userWithOrg);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

      // Act
      const result = await service.validateUser(mockEmail, mockPassword);

      // Assert
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('organization');
      expect(result.user.email).toBe(mockEmail);
      expect(result.organization.id).toBe(mockOrgId);
    });

    it('debería lanzar UnauthorizedException si el usuario no existe', async () => {
      // Arrange
      prismaService.user.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.validateUser(mockEmail, mockPassword)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('debería lanzar UnauthorizedException si el usuario no tiene organización', async () => {
      // Arrange
      const userWithoutOrg = { ...mockUser, organization: null };
      prismaService.user.findUnique.mockResolvedValue(userWithoutOrg);

      // Act & Assert
      await expect(service.validateUser(mockEmail, mockPassword)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('debería lanzar UnauthorizedException si la contraseña es incorrecta', async () => {
      // Arrange
      const userWithOrg = { ...mockUser, organization: mockOrganization };
      prismaService.user.findUnique.mockResolvedValue(userWithOrg);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      // Act & Assert
      await expect(service.validateUser(mockEmail, mockPassword)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('debería lanzar UnauthorizedException si el usuario está inactivo', async () => {
      // Arrange
      const inactiveUser = { ...mockUser, isActive: false, organization: mockOrganization };
      prismaService.user.findUnique.mockResolvedValue(inactiveUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

      // Act & Assert
      await expect(service.validateUser(mockEmail, mockPassword)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('debería lanzar UnauthorizedException si el usuario está eliminado', async () => {
      // Arrange
      const deletedUser = { ...mockUser, deletedAt: new Date(), organization: mockOrganization };
      prismaService.user.findUnique.mockResolvedValue(deletedUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

      // Act & Assert
      await expect(service.validateUser(mockEmail, mockPassword)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('debería lanzar UnauthorizedException si la organización está inactiva', async () => {
      // Arrange
      const inactiveOrg = { ...mockOrganization, isActive: false };
      const userWithInactiveOrg = { ...mockUser, organization: inactiveOrg };
      prismaService.user.findUnique.mockResolvedValue(userWithInactiveOrg);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

      // Act & Assert
      await expect(service.validateUser(mockEmail, mockPassword)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ============================================================================
  // GENERATE TOKENS TESTS
  // ============================================================================

  describe('generateTokens', () => {
    it('debería generar access y refresh tokens exitosamente', async () => {
      // Arrange
      jwtService.sign.mockReturnValueOnce(mockAccessToken).mockReturnValueOnce(mockRefreshToken);
      configService.get.mockReturnValue('7d');
      prismaService.refreshToken.create.mockResolvedValue(mockRefreshTokenRecord);

      // Act
      const result = await service.generateTokens(
        mockUserId,
        mockEmail,
        mockName,
        'owner',
        mockOrgId,
        'Test Organization',
        PlanType.FREE,
      );

      // Assert
      expect(result).toHaveProperty('accessToken', mockAccessToken);
      expect(result).toHaveProperty('refreshToken', mockRefreshToken);
      expect(jwtService.sign).toHaveBeenCalledTimes(2);
      expect(prismaService.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tokenHash: expect.any(String),
          familyId: expect.any(String),
          userId: mockUserId,
          expiresAt: expect.any(Date),
        }),
      });
    });

    it('debería usar las variables de entorno para configurar el refresh token', async () => {
      // Arrange
      jwtService.sign.mockReturnValueOnce(mockAccessToken).mockReturnValueOnce(mockRefreshToken);
      configService.get.mockReturnValueOnce('30d').mockReturnValueOnce('custom-refresh-secret');
      prismaService.refreshToken.create.mockResolvedValue(mockRefreshTokenRecord);

      // Act
      await service.generateTokens(
        mockUserId,
        mockEmail,
        mockName,
        'owner',
        mockOrgId,
        'Test Organization',
        PlanType.FREE,
      );

      // Assert
      expect(configService.get).toHaveBeenCalledWith('JWT_REFRESH_EXPIRES_IN');
      expect(configService.get).toHaveBeenCalledWith('JWT_REFRESH_SECRET');
    });
  });

  // ============================================================================
  // REFRESH TOKENS TESTS
  // ============================================================================

  describe('refreshTokens', () => {
    const mockPayload = {
      sub: mockUserId,
      email: mockEmail,
      name: mockName,
      role: 'owner',
      organizationId: mockOrgId,
      organizationName: 'Test Organization',
      plan: PlanType.FREE,
    };

    it('debería refrescar tokens exitosamente con refresh token válido', async () => {
      // Arrange
      jwtService.verify.mockReturnValue(mockPayload);
      prismaService.refreshToken.findMany.mockResolvedValue([mockRefreshTokenRecord]);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      prismaService.refreshToken.update.mockResolvedValue(mockRefreshTokenRecord);
      jwtService.sign.mockReturnValueOnce(mockAccessToken).mockReturnValueOnce(mockRefreshToken);
      configService.get.mockReturnValue('7d');
      prismaService.refreshToken.create.mockResolvedValue(mockRefreshTokenRecord);

      // Act
      const result = await service.refreshTokens(mockRefreshToken);

      // Assert
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(prismaService.refreshToken.update).toHaveBeenCalledWith({
        where: { id: mockRefreshTokenRecord.id },
        data: {
          revokedAt: expect.any(Date),
          revokedReason: 'token_rotated',
        },
      });
    });

    it('debería lanzar UnauthorizedException si el refresh token no es válido', async () => {
      // Arrange
      jwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      // Act & Assert
      await expect(service.refreshTokens('invalid-token')).rejects.toThrow(UnauthorizedException);
    });

    it('debería lanzar UnauthorizedException si no hay tokens almacenados', async () => {
      // Arrange
      jwtService.verify.mockReturnValue(mockPayload);
      prismaService.refreshToken.findMany.mockResolvedValue([]);

      // Act & Assert
      await expect(service.refreshTokens(mockRefreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('debería lanzar UnauthorizedException si el refresh token no coincide', async () => {
      // Arrange
      jwtService.verify.mockReturnValue(mockPayload);
      prismaService.refreshToken.findMany.mockResolvedValue([mockRefreshTokenRecord]);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      // Act & Assert
      await expect(service.refreshTokens(mockRefreshToken)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ============================================================================
  // LOGOUT TESTS
  // ============================================================================

  describe('logout', () => {
    const mockPayload = {
      sub: mockUserId,
      email: mockEmail,
      name: mockName,
      role: 'owner',
      organizationId: mockOrgId,
      organizationName: 'Test Organization',
      plan: PlanType.FREE,
    };

    it('debería cerrar sesión exitosamente', async () => {
      // Arrange
      jwtService.decode.mockReturnValue(mockPayload);
      prismaService.refreshToken.findMany.mockResolvedValue([mockRefreshTokenRecord]);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      prismaService.refreshToken.update.mockResolvedValue(mockRefreshTokenRecord);

      // Act
      const result = await service.logout(mockRefreshToken);

      // Assert
      expect(result).toEqual({ message: 'Sesión cerrada exitosamente' });
      expect(prismaService.refreshToken.update).toHaveBeenCalledWith({
        where: { id: mockRefreshTokenRecord.id },
        data: {
          revokedAt: expect.any(Date),
          revokedReason: 'logout',
        },
      });
    });

    it('debería retornar mensaje si el token no se encuentra', async () => {
      // Arrange
      jwtService.decode.mockReturnValue(mockPayload);
      prismaService.refreshToken.findMany.mockResolvedValue([mockRefreshTokenRecord]);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      // Act
      const result = await service.logout(mockRefreshToken);

      // Assert
      expect(result).toEqual({ message: 'Token no encontrado' });
    });

    it('debería lanzar UnauthorizedException si el token es inválido', async () => {
      // Arrange
      jwtService.decode.mockReturnValue(null);

      // Act & Assert
      await expect(service.logout('invalid-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ============================================================================
  // LOGOUT ALL TESTS
  // ============================================================================

  describe('logoutAll', () => {
    it('debería cerrar todas las sesiones exitosamente', async () => {
      // Arrange
      prismaService.refreshToken.updateMany.mockResolvedValue({ count: 3 });

      // Act
      const result = await service.logoutAll(mockUserId);

      // Assert
      expect(result).toEqual({ message: 'Sesión cerrada en todos los dispositivos' });
      expect(prismaService.refreshToken.updateMany).toHaveBeenCalledWith({
        where: {
          userId: mockUserId,
          revokedAt: null,
        },
        data: {
          revokedAt: expect.any(Date),
          revokedReason: 'logout_all',
        },
      });
    });

    it('debería funcionar incluso si no hay sesiones activas', async () => {
      // Arrange
      prismaService.refreshToken.updateMany.mockResolvedValue({ count: 0 });

      // Act
      const result = await service.logoutAll(mockUserId);

      // Assert
      expect(result).toEqual({ message: 'Sesión cerrada en todos los dispositivos' });
    });
  });
});
