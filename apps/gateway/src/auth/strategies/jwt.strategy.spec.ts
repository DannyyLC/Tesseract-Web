import { Test, TestingModule } from '@nestjs/testing';
import { JwtStrategy } from './jwt.strategy';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { UnauthorizedException, Logger } from '@nestjs/common';
import { UserPayload } from '../../common/types/user-payload.type';
import { PlanType } from '@workflow-automation/shared-types';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prismaService: jest.Mocked<PrismaService>;
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

  const mockPayload: UserPayload = {
    sub: mockUserId,
    email: mockEmail,
    name: mockName,
    role: 'owner',
    organizationId: mockOrgId,
    organizationName: 'Test Organization',
    plan: PlanType.FREE,
  };

  const mockUser = {
    id: mockUserId,
    email: mockEmail,
    name: mockName,
    password: 'hashed',
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

  beforeEach(async () => {
    const mockPrismaService = {
      user: {
        findUnique: jest.fn(),
      },
    };

    const mockConfigService = {
      get: jest.fn().mockReturnValue('test-secret'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
    prismaService = module.get(PrismaService);
    configService = module.get(ConfigService);
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('validate', () => {
    it('debería validar y retornar el UserPayload para un usuario válido', async () => {
      // Arrange
      const userWithOrg = { ...mockUser, organization: mockOrganization };
      prismaService.user.findUnique.mockResolvedValue(userWithOrg);

      // Act
      const result = await strategy.validate(mockPayload);

      // Assert
      expect(result).toEqual({
        sub: mockUserId,
        email: mockEmail,
        name: mockName,
        role: 'owner',
        organizationId: mockOrgId,
        organizationName: 'Test Organization',
        plan: PlanType.FREE,
      });
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: mockUserId },
        include: { organization: true },
      });
    });

    it('debería lanzar UnauthorizedException si el usuario no existe', async () => {
      // Arrange
      prismaService.user.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(strategy.validate(mockPayload)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(strategy.validate(mockPayload)).rejects.toThrow(
        'Usuario no encontrado',
      );
    });

    it('debería lanzar UnauthorizedException si el usuario no tiene organización', async () => {
      // Arrange
      const userWithoutOrg = { ...mockUser, organization: null };
      prismaService.user.findUnique.mockResolvedValue(userWithoutOrg);

      // Act & Assert
      await expect(strategy.validate(mockPayload)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(strategy.validate(mockPayload)).rejects.toThrow(
        'Usuario sin organización',
      );
    });

    it('debería lanzar UnauthorizedException si el usuario está inactivo', async () => {
      // Arrange
      const inactiveUser = {
        ...mockUser,
        isActive: false,
        organization: mockOrganization,
      };
      prismaService.user.findUnique.mockResolvedValue(inactiveUser);

      // Act & Assert
      await expect(strategy.validate(mockPayload)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(strategy.validate(mockPayload)).rejects.toThrow(
        'Cuenta inactiva',
      );
    });

    it('debería lanzar UnauthorizedException si el usuario está eliminado', async () => {
      // Arrange
      const deletedUser = {
        ...mockUser,
        deletedAt: new Date(),
        organization: mockOrganization,
      };
      prismaService.user.findUnique.mockResolvedValue(deletedUser);

      // Act & Assert
      await expect(strategy.validate(mockPayload)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(strategy.validate(mockPayload)).rejects.toThrow(
        'Cuenta eliminada',
      );
    });

    it('debería lanzar UnauthorizedException si la organización está inactiva', async () => {
      // Arrange
      const inactiveOrg = { ...mockOrganization, isActive: false };
      const userWithInactiveOrg = { ...mockUser, organization: inactiveOrg };
      prismaService.user.findUnique.mockResolvedValue(userWithInactiveOrg);

      // Act & Assert
      await expect(strategy.validate(mockPayload)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(strategy.validate(mockPayload)).rejects.toThrow(
        'Organización inactiva',
      );
    });

    it('debería lanzar UnauthorizedException si el email no coincide', async () => {
      // Arrange
      const userWithDifferentEmail = {
        ...mockUser,
        email: 'different@example.com',
        organization: mockOrganization,
      };
      prismaService.user.findUnique.mockResolvedValue(userWithDifferentEmail);

      // Act & Assert
      await expect(strategy.validate(mockPayload)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(strategy.validate(mockPayload)).rejects.toThrow(
        'Token inválido',
      );
    });

    it('debería retornar el UserPayload correcto con todos los campos', async () => {
      // Arrange
      const userWithOrg = { ...mockUser, organization: mockOrganization };
      prismaService.user.findUnique.mockResolvedValue(userWithOrg);

      // Act
      const result = await strategy.validate(mockPayload);

      // Assert
      expect(result).toHaveProperty('sub');
      expect(result).toHaveProperty('email');
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('role');
      expect(result).toHaveProperty('organizationId');
      expect(result).toHaveProperty('organizationName');
      expect(result).toHaveProperty('plan');
    });

    it('debería usar el secret del ConfigService', () => {
      // Assert
      expect(configService.get).toHaveBeenCalledWith('JWT_SECRET');
    });
  });
});
