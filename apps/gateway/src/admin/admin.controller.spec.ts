import { Test, TestingModule } from '@nestjs/testing';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdminController } from './admin.controller';
import { AdminService } from './services/admin.service';
import { AuditService } from './services/audit.service';
import { SuperAdminsConfig } from './config/super-admins.config';
import { SuperAdminGuard } from './guards/super-admin.guard';

describe('AdminController', () => {
  let controller: AdminController;
  let adminService: jest.Mocked<AdminService>;
  let auditService: jest.Mocked<AuditService>;
  let superAdminsConfig: jest.Mocked<SuperAdminsConfig>;
  let jwtService: jest.Mocked<JwtService>;

  const mockSuperAdmin = {
    id: 'super-admin-123',
    email: 'admin@system.com',
    name: 'Super Admin',
    role: 'super_admin' as const,
  };

  const mockRequest = {
    headers: {
      'user-agent': 'Mozilla/5.0',
    },
    connection: {
      remoteAddress: '192.168.1.100',
    },
    socket: {
      remoteAddress: '192.168.1.100',
    },
  } as any;

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
    const mockAdminService = {
      createOrganization: jest.fn(),
      getAllOrganizations: jest.fn(),
      getOrganization: jest.fn(),
      changeOrganizationPlan: jest.fn(),
      updateOrganizationLimits: jest.fn(),
      toggleOrganizationStatus: jest.fn(),
      deleteOrganization: jest.fn(),
      createUser: jest.fn(),
      getOrganizationUsers: jest.fn(),
      getUser: jest.fn(),
      changeUserRole: jest.fn(),
      toggleUserStatus: jest.fn(),
      getGlobalStats: jest.fn(),
      getStatsByPlan: jest.fn(),
      getTopOrganizations: jest.fn(),
    };

    const mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
      getClientIP: jest.fn().mockReturnValue('192.168.1.100'),
      findAll: jest.fn(),
      getStats: jest.fn(),
    };

    const mockSuperAdminsConfig = {
      verifyCredentials: jest.fn(),
      isIPAllowed: jest.fn(),
    };

    const mockJwtService = {
      signAsync: jest.fn(),
    };

    const mockGuard = { canActivate: jest.fn(() => true) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: AdminService, useValue: mockAdminService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: SuperAdminsConfig, useValue: mockSuperAdminsConfig },
        { provide: JwtService, useValue: mockJwtService },
      ],
    })
      .overrideGuard(SuperAdminGuard)
      .useValue(mockGuard)
      .compile();

    controller = module.get<AdminController>(AdminController);
    adminService = module.get(AdminService) as jest.Mocked<AdminService>;
    auditService = module.get(AuditService) as jest.Mocked<AuditService>;
    superAdminsConfig = module.get(SuperAdminsConfig) as jest.Mocked<SuperAdminsConfig>;
    jwtService = module.get(JwtService) as jest.Mocked<JwtService>;

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
      email: 'admin@system.com',
      password: 'super-secret-password',
    };

    it('debería hacer login exitosamente con credenciales válidas', async () => {
      // Arrange
      superAdminsConfig.verifyCredentials.mockResolvedValue(mockSuperAdmin as any);
      superAdminsConfig.isIPAllowed.mockReturnValue(true);
      jwtService.signAsync.mockResolvedValue('mock-jwt-token');

      // Act
      const result = await controller.login(loginDto, mockRequest);

      // Assert
      expect(result).toEqual({
        accessToken: 'mock-jwt-token',
        superAdmin: {
          id: mockSuperAdmin.id,
          email: mockSuperAdmin.email,
          name: mockSuperAdmin.name,
          role: 'super_admin',
        },
        expiresIn: '30m',
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'login_success',
          success: true,
        }),
      );
    });

    it('debería lanzar UnauthorizedException con credenciales inválidas', async () => {
      // Arrange
      superAdminsConfig.verifyCredentials.mockResolvedValue(null);

      // Act & Assert
      await expect(controller.login(loginDto, mockRequest)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'login_failed',
          success: false,
        }),
      );
    });

    it('debería bloquear login desde IP no permitida', async () => {
      // Arrange
      superAdminsConfig.verifyCredentials.mockResolvedValue(mockSuperAdmin as any);
      superAdminsConfig.isIPAllowed.mockReturnValue(false);

      // Act & Assert
      await expect(controller.login(loginDto, mockRequest)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'login_blocked_ip',
          success: false,
        }),
      );
    });

    it('debería obtener la IP del cliente correctamente', async () => {
      // Arrange
      superAdminsConfig.verifyCredentials.mockResolvedValue(mockSuperAdmin as any);
      superAdminsConfig.isIPAllowed.mockReturnValue(true);
      jwtService.signAsync.mockResolvedValue('mock-jwt-token');

      // Act
      await controller.login(loginDto, mockRequest);

      // Assert
      expect(auditService.getClientIP).toHaveBeenCalledWith(mockRequest);
    });

    it('debería generar JWT con payload correcto', async () => {
      // Arrange
      superAdminsConfig.verifyCredentials.mockResolvedValue(mockSuperAdmin as any);
      superAdminsConfig.isIPAllowed.mockReturnValue(true);
      jwtService.signAsync.mockResolvedValue('mock-jwt-token');

      // Act
      await controller.login(loginDto, mockRequest);

      // Assert
      expect(jwtService.signAsync).toHaveBeenCalledWith({
        sub: mockSuperAdmin.id,
        email: mockSuperAdmin.email,
        name: mockSuperAdmin.name,
        role: 'super_admin',
      });
    });
  });

  // ============================================================================
  // ORGANIZATIONS TESTS
  // ============================================================================

  describe('createOrganization', () => {
    it('debería crear una organización exitosamente', async () => {
      // Arrange
      const body = { name: 'New Org', slug: 'new-org', plan: 'pro' as const };
      const mockOrg = { id: 'org-123', ...body };
      adminService.createOrganization.mockResolvedValue(mockOrg as any);

      // Act
      const result = await controller.createOrganization(mockSuperAdmin, body);

      // Assert
      expect(result).toEqual(mockOrg);
      expect(adminService.createOrganization).toHaveBeenCalledWith(body);
    });
  });

  describe('getAllOrganizations', () => {
    it('debería listar todas las organizaciones', async () => {
      // Arrange
      const mockOrgs = {
        total: 100,
        organizations: [{ id: 'org-1' }, { id: 'org-2' }],
      };
      adminService.getAllOrganizations.mockResolvedValue(mockOrgs as any);

      // Act
      const result = await controller.getAllOrganizations(mockSuperAdmin);

      // Assert
      expect(result).toEqual(mockOrgs);
      expect(adminService.getAllOrganizations).toHaveBeenCalled();
    });

    it('debería aceptar parámetros de paginación', async () => {
      // Arrange
      adminService.getAllOrganizations.mockResolvedValue({ total: 0, organizations: [] } as any);

      // Act
      await controller.getAllOrganizations(mockSuperAdmin, '2', '25');

      // Assert
      expect(adminService.getAllOrganizations).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2, limit: 25 }),
      );
    });

    it('debería aceptar filtros de búsqueda', async () => {
      // Arrange
      adminService.getAllOrganizations.mockResolvedValue({ total: 0, organizations: [] } as any);

      // Act
      await controller.getAllOrganizations(
        mockSuperAdmin,
        undefined,
        undefined,
        'test',
        'pro',
        'true',
      );

      // Assert
      expect(adminService.getAllOrganizations).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'test',
          plan: 'pro',
          isActive: true,
        }),
      );
    });
  });

  describe('getOrganization', () => {
    it('debería obtener detalles de una organización', async () => {
      // Arrange
      const mockOrg = { id: 'org-123', name: 'Test Org' };
      adminService.getOrganization.mockResolvedValue(mockOrg as any);

      // Act
      const result = await controller.getOrganization(mockSuperAdmin, 'org-123');

      // Assert
      expect(result).toEqual(mockOrg);
      expect(adminService.getOrganization).toHaveBeenCalledWith('org-123');
    });
  });

  describe('changeOrganizationPlan', () => {
    it('debería cambiar el plan de una organización', async () => {
      // Arrange
      const mockOrg = { id: 'org-123', plan: 'enterprise' };
      adminService.changeOrganizationPlan.mockResolvedValue(mockOrg as any);

      // Act
      const result = await controller.changeOrganizationPlan(
        mockSuperAdmin,
        'org-123',
        { plan: 'enterprise' },
      );

      // Assert
      expect(result).toEqual(mockOrg);
      expect(adminService.changeOrganizationPlan).toHaveBeenCalledWith('org-123', 'enterprise');
    });
  });

  describe('updateOrganizationLimits', () => {
    it('debería actualizar límites de una organización', async () => {
      // Arrange
      const limits = { maxUsers: 100, maxWorkflows: 50 };
      const mockOrg = { id: 'org-123', ...limits };
      adminService.updateOrganizationLimits.mockResolvedValue(mockOrg as any);

      // Act
      const result = await controller.updateOrganizationLimits(mockSuperAdmin, 'org-123', limits);

      // Assert
      expect(result).toEqual(mockOrg);
      expect(adminService.updateOrganizationLimits).toHaveBeenCalledWith('org-123', limits);
    });
  });

  describe('toggleOrganizationStatus', () => {
    it('debería activar/desactivar una organización', async () => {
      // Arrange
      const mockOrg = { id: 'org-123', isActive: false };
      adminService.toggleOrganizationStatus.mockResolvedValue(mockOrg as any);

      // Act
      const result = await controller.toggleOrganizationStatus(mockSuperAdmin, 'org-123', {
        isActive: false,
      });

      // Assert
      expect(result).toEqual(mockOrg);
      expect(adminService.toggleOrganizationStatus).toHaveBeenCalledWith('org-123', false);
    });
  });

  describe('deleteOrganization', () => {
    it('debería eliminar una organización', async () => {
      // Arrange
      adminService.deleteOrganization.mockResolvedValue({ message: 'Organization deleted' } as any);

      // Act
      await controller.deleteOrganization(mockSuperAdmin, 'org-123');

      // Assert
      expect(adminService.deleteOrganization).toHaveBeenCalledWith('org-123');
    });
  });

  // ============================================================================
  // USERS TESTS
  // ============================================================================

  describe('createUser', () => {
    it('debería crear un usuario en una organización', async () => {
      // Arrange
      const body = {
        email: 'user@test.com',
        name: 'Test User',
        password: 'password',
        role: 'admin' as const,
      };
      const mockUser = { id: 'user-123', ...body };
      adminService.createUser.mockResolvedValue(mockUser as any);

      // Act
      const result = await controller.createUser(mockSuperAdmin, 'org-123', body);

      // Assert
      expect(result).toEqual(mockUser);
      expect(adminService.createUser).toHaveBeenCalledWith('org-123', body);
    });
  });

  describe('getOrganizationUsers', () => {
    it('debería listar usuarios de una organización', async () => {
      // Arrange
      const mockUsers = [{ id: 'user-1' }, { id: 'user-2' }];
      adminService.getOrganizationUsers.mockResolvedValue(mockUsers as any);

      // Act
      const result = await controller.getOrganizationUsers(mockSuperAdmin, 'org-123');

      // Assert
      expect(result).toEqual(mockUsers);
      expect(adminService.getOrganizationUsers).toHaveBeenCalledWith('org-123');
    });
  });

  describe('getUser', () => {
    it('debería obtener detalles de un usuario', async () => {
      // Arrange
      const mockUser = { id: 'user-123', email: 'user@test.com' };
      adminService.getUser.mockResolvedValue(mockUser as any);

      // Act
      const result = await controller.getUser(mockSuperAdmin, 'user-123');

      // Assert
      expect(result).toEqual(mockUser);
      expect(adminService.getUser).toHaveBeenCalledWith('user-123');
    });
  });

  describe('changeUserRole', () => {
    it('debería cambiar el rol de un usuario', async () => {
      // Arrange
      const mockUser = { id: 'user-123', role: 'admin' };
      adminService.changeUserRole.mockResolvedValue(mockUser as any);

      // Act
      const result = await controller.changeUserRole(mockSuperAdmin, 'user-123', { role: 'admin' });

      // Assert
      expect(result).toEqual(mockUser);
      expect(adminService.changeUserRole).toHaveBeenCalledWith('user-123', 'admin');
    });
  });

  describe('toggleUserStatus', () => {
    it('debería activar/desactivar un usuario', async () => {
      // Arrange
      const mockUser = { id: 'user-123', isActive: false };
      adminService.toggleUserStatus.mockResolvedValue(mockUser as any);

      // Act
      const result = await controller.toggleUserStatus(mockSuperAdmin, 'user-123', {
        isActive: false,
      });

      // Assert
      expect(result).toEqual(mockUser);
      expect(adminService.toggleUserStatus).toHaveBeenCalledWith('user-123', false);
    });
  });

  // ============================================================================
  // ANALYTICS TESTS
  // ============================================================================

  describe('getGlobalStats', () => {
    it('debería obtener estadísticas globales del sistema', async () => {
      // Arrange
      const mockStats = {
        totalOrganizations: 100,
        totalUsers: 500,
        totalWorkflows: 1000,
      };
      adminService.getGlobalStats.mockResolvedValue(mockStats as any);

      // Act
      const result = await controller.getGlobalStats(mockSuperAdmin);

      // Assert
      expect(result).toEqual(mockStats);
      expect(adminService.getGlobalStats).toHaveBeenCalled();
    });
  });

  describe('getStatsByPlan', () => {
    it('debería obtener estadísticas por plan', async () => {
      // Arrange
      const mockStats = [
        { plan: 'free', count: 50 },
        { plan: 'pro', count: 30 },
      ];
      adminService.getStatsByPlan.mockResolvedValue(mockStats as any);

      // Act
      const result = await controller.getStatsByPlan(mockSuperAdmin);

      // Assert
      expect(result).toEqual(mockStats);
      expect(adminService.getStatsByPlan).toHaveBeenCalled();
    });
  });

  describe('getTopOrganizations', () => {
    it('debería obtener top organizaciones por ejecuciones', async () => {
      // Arrange
      const mockOrgs = [
        { id: 'org-1', executions: 1000 },
        { id: 'org-2', executions: 800 },
      ];
      adminService.getTopOrganizations.mockResolvedValue(mockOrgs as any);

      // Act
      const result = await controller.getTopOrganizations(mockSuperAdmin, 'executions');

      // Assert
      expect(result).toEqual(mockOrgs);
      expect(adminService.getTopOrganizations).toHaveBeenCalledWith('executions', 10);
    });

    it('debería aceptar límite personalizado', async () => {
      // Arrange
      adminService.getTopOrganizations.mockResolvedValue([] as any);

      // Act
      await controller.getTopOrganizations(mockSuperAdmin, 'workflows', '25');

      // Assert
      expect(adminService.getTopOrganizations).toHaveBeenCalledWith('workflows', 25);
    });

    it('debería usar límite por defecto de 10', async () => {
      // Arrange
      adminService.getTopOrganizations.mockResolvedValue([] as any);

      // Act
      await controller.getTopOrganizations(mockSuperAdmin, 'users');

      // Assert
      expect(adminService.getTopOrganizations).toHaveBeenCalledWith('users', 10);
    });
  });

  // ============================================================================
  // AUDIT LOGS TESTS
  // ============================================================================

  describe('getAuditLogs', () => {
    it('debería obtener logs de auditoría', async () => {
      // Arrange
      const mockLogs = {
        total: 100,
        logs: [{ id: 'log-1' }, { id: 'log-2' }],
      };
      auditService.findAll.mockResolvedValue(mockLogs as any);

      // Act
      const result = await controller.getAuditLogs(mockSuperAdmin);

      // Assert
      expect(result).toEqual(mockLogs);
      expect(auditService.findAll).toHaveBeenCalled();
    });

    it('debería aceptar filtros de auditoría', async () => {
      // Arrange
      auditService.findAll.mockResolvedValue({ total: 0, logs: [] } as any);

      // Act
      await controller.getAuditLogs(
        mockSuperAdmin,
        'admin@system.com',
        'login_success',
        'org-123',
        'true',
        '2024-01-01',
        '2024-01-31',
        '1',
        '50',
      );

      // Assert
      expect(auditService.findAll).toHaveBeenCalledWith({
        superAdminEmail: 'admin@system.com',
        action: 'login_success',
        organizationId: 'org-123',
        success: true,
        startDate: expect.any(Date),
        endDate: expect.any(Date),
        page: 1,
        limit: 50,
      });
    });
  });

  describe('getAuditStats', () => {
    it('debería obtener estadísticas de auditoría', async () => {
      // Arrange
      const mockStats = {
        totalActions: 500,
        successRate: 98,
        topActions: [],
      };
      auditService.getStats.mockResolvedValue(mockStats as any);

      // Act
      const result = await controller.getAuditStats(mockSuperAdmin);

      // Assert
      expect(result).toEqual(mockStats);
      expect(auditService.getStats).toHaveBeenCalled();
    });

    it('debería aceptar rango de fechas', async () => {
      // Arrange
      auditService.getStats.mockResolvedValue({} as any);

      // Act
      await controller.getAuditStats(mockSuperAdmin, '2024-01-01', '2024-01-31');

      // Assert
      expect(auditService.getStats).toHaveBeenCalledWith({
        startDate: expect.any(Date),
        endDate: expect.any(Date),
      });
    });
  });
});
