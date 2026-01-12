import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { UserRole } from '@workflow-automation/shared-types';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { API_KEY_ONLY } from '../decorators/api-key-only.decorator';
import { UserPayload } from '../../common/types/jwt-payload.type';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: jest.Mocked<Reflector>;

  const mockUserOwner: UserPayload = {
    sub: 'user-123',
    email: 'owner@test.com',
    name: 'Owner User',
    role: UserRole.OWNER,
    organizationId: 'org-123',
    organizationName: 'Test Org',
    plan: 'PRO',
  };

  const mockUserAdmin: UserPayload = {
    sub: 'user-456',
    email: 'admin@test.com',
    name: 'Admin User',
    role: UserRole.ADMIN,
    organizationId: 'org-123',
    organizationName: 'Test Org',
    plan: 'PRO',
  };

  const mockUserViewer: UserPayload = {
    sub: 'user-789',
    email: 'viewer@test.com',
    name: 'Viewer User',
    role: UserRole.VIEWER,
    organizationId: 'org-123',
    organizationName: 'Test Org',
    plan: 'FREE',
  };

  // Mock request
  const createMockRequest = (user?: UserPayload) => ({
    user,
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
    const mockReflector = {
      getAllAndOverride: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [RolesGuard, { provide: Reflector, useValue: mockReflector }],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get(Reflector);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  // ============================================================================
  // API KEY ONLY TESTS
  // ============================================================================

  describe('API Key Only Bypass', () => {
    it('debería permitir acceso si el endpoint está marcado como API_KEY_ONLY', () => {
      // Arrange
      const request = createMockRequest();
      const context = createMockContext(request);

      // Configurar reflector para retornar true en API_KEY_ONLY
      reflector.getAllAndOverride.mockImplementation((key: any) => {
        if (key === API_KEY_ONLY) return true;
        return undefined;
      });

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(API_KEY_ONLY, [
        context.getHandler(),
        context.getClass(),
      ]);
    });
  });

  // ============================================================================
  // NO ROLES REQUIRED TESTS
  // ============================================================================

  describe('No Roles Required', () => {
    it('debería permitir acceso si no hay roles requeridos', () => {
      // Arrange
      const request = createMockRequest(mockUserViewer);
      const context = createMockContext(request);

      reflector.getAllAndOverride.mockReturnValue(undefined);

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('debería permitir acceso si el array de roles está vacío', () => {
      // Arrange
      const request = createMockRequest(mockUserViewer);
      const context = createMockContext(request);

      reflector.getAllAndOverride.mockImplementation((key: any) => {
        if (key === ROLES_KEY) return [];
        return undefined;
      });

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });
  });

  // ============================================================================
  // USER VALIDATION TESTS
  // ============================================================================

  describe('User Validation', () => {
    it('debería lanzar ForbiddenException si no hay usuario en request', () => {
      // Arrange
      const request = createMockRequest(); // Sin usuario
      const context = createMockContext(request);

      reflector.getAllAndOverride.mockImplementation((key: any) => {
        if (key === ROLES_KEY) return [UserRole.OWNER];
        return undefined;
      });

      // Act & Assert
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(
        'Usuario no autenticado',
      );
    });
  });

  // ============================================================================
  // ROLE AUTHORIZATION TESTS
  // ============================================================================

  describe('Role Authorization', () => {
    it('debería permitir acceso si el usuario tiene el rol requerido', () => {
      // Arrange
      const request = createMockRequest(mockUserOwner);
      const context = createMockContext(request);

      reflector.getAllAndOverride.mockImplementation((key: any) => {
        if (key === ROLES_KEY) return [UserRole.OWNER];
        return undefined;
      });

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('debería permitir acceso si el usuario tiene uno de los roles requeridos', () => {
      // Arrange
      const request = createMockRequest(mockUserAdmin);
      const context = createMockContext(request);

      reflector.getAllAndOverride.mockImplementation((key: any) => {
        if (key === ROLES_KEY) return [UserRole.OWNER, UserRole.ADMIN];
        return undefined;
      });

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('debería denegar acceso si el usuario no tiene el rol requerido', () => {
      // Arrange
      const request = createMockRequest(mockUserViewer);
      const context = createMockContext(request);

      reflector.getAllAndOverride.mockImplementation((key: any) => {
        if (key === ROLES_KEY) return [UserRole.OWNER];
        return undefined;
      });

      // Act & Assert
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(
        'Acceso denegado. Se requiere uno de los siguientes roles: owner',
      );
    });

    it('debería denegar acceso si el usuario no tiene ninguno de los roles requeridos', () => {
      // Arrange
      const request = createMockRequest(mockUserViewer);
      const context = createMockContext(request);

      reflector.getAllAndOverride.mockImplementation((key: any) => {
        if (key === ROLES_KEY) return [UserRole.OWNER, UserRole.ADMIN];
        return undefined;
      });

      // Act & Assert
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(
        'Acceso denegado. Se requiere uno de los siguientes roles: owner, admin',
      );
    });
  });

  // ============================================================================
  // SPECIFIC ROLE SCENARIOS
  // ============================================================================

  describe('Specific Role Scenarios', () => {
    it('OWNER debería acceder a endpoints solo para OWNER', () => {
      // Arrange
      const request = createMockRequest(mockUserOwner);
      const context = createMockContext(request);

      reflector.getAllAndOverride.mockImplementation((key: any) => {
        if (key === ROLES_KEY) return [UserRole.OWNER];
        return undefined;
      });

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('ADMIN debería acceder a endpoints para ADMIN y OWNER', () => {
      // Arrange
      const request = createMockRequest(mockUserAdmin);
      const context = createMockContext(request);

      reflector.getAllAndOverride.mockImplementation((key: any) => {
        if (key === ROLES_KEY) return [UserRole.OWNER, UserRole.ADMIN];
        return undefined;
      });

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('ADMIN NO debería acceder a endpoints solo para OWNER', () => {
      // Arrange
      const request = createMockRequest(mockUserAdmin);
      const context = createMockContext(request);

      reflector.getAllAndOverride.mockImplementation((key: any) => {
        if (key === ROLES_KEY) return [UserRole.OWNER];
        return undefined;
      });

      // Act & Assert
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('VIEWER debería acceder a endpoints para todos los roles', () => {
      // Arrange
      const request = createMockRequest(mockUserViewer);
      const context = createMockContext(request);

      reflector.getAllAndOverride.mockImplementation((key: any) => {
        if (key === ROLES_KEY)
          return [UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER];
        return undefined;
      });

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('VIEWER NO debería acceder a endpoints solo para OWNER/ADMIN', () => {
      // Arrange
      const request = createMockRequest(mockUserViewer);
      const context = createMockContext(request);

      reflector.getAllAndOverride.mockImplementation((key: any) => {
        if (key === ROLES_KEY) return [UserRole.OWNER, UserRole.ADMIN];
        return undefined;
      });

      // Act & Assert
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  // ============================================================================
  // REFLECTOR TESTS
  // ============================================================================

  describe('Reflector Integration', () => {
    it('debería verificar metadatos del handler y de la clase', () => {
      // Arrange
      const request = createMockRequest(mockUserOwner);
      const context = createMockContext(request);

      reflector.getAllAndOverride.mockImplementation((key: any) => {
        if (key === ROLES_KEY) return [UserRole.OWNER];
        return undefined;
      });

      // Act
      guard.canActivate(context);

      // Assert
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
    });

    it('debería verificar API_KEY_ONLY antes de los roles', () => {
      // Arrange
      const request = createMockRequest();
      const context = createMockContext(request);

      reflector.getAllAndOverride.mockReturnValue(true);

      // Act
      guard.canActivate(context);

      // Assert
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(API_KEY_ONLY, [
        context.getHandler(),
        context.getClass(),
      ]);
    });
  });
});
