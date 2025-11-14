import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { AuditService, AuditLogData } from './audit.service';
import { PrismaService } from '../../database/prisma.service';
import { Request } from 'express';

describe('AuditService', () => {
  let service: AuditService;
  let prismaService: jest.Mocked<PrismaService>;
  let loggerWarnSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;

  const mockAuditLog = {
    id: 'audit-123',
    superAdminId: 'admin-123',
    superAdminEmail: 'admin@test.com',
    superAdminName: 'Test Admin',
    action: 'create_organization',
    resource: 'organization',
    resourceId: 'org-123',
    method: 'POST',
    endpoint: '/admin/organizations',
    changes: { name: 'New Org' },
    metadata: { source: 'admin-panel' },
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0',
    statusCode: 201,
    success: true,
    errorMessage: null,
    duration: 150,
    organizationId: 'org-123',
    timestamp: new Date(),
  };

  const mockAuditLogData: AuditLogData = {
    superAdminId: 'admin-123',
    superAdminEmail: 'admin@test.com',
    superAdminName: 'Test Admin',
    action: 'create_organization',
    resource: 'organization',
    resourceId: 'org-123',
    method: 'POST',
    endpoint: '/admin/organizations',
    changes: { name: 'New Org' },
    metadata: { source: 'admin-panel' },
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0',
    statusCode: 201,
    success: true,
    errorMessage: undefined,
    duration: 150,
    organizationId: 'org-123',
  };

  // Silenciar logs durante los tests
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(async () => {
    const mockPrismaService = {
      auditLog: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
    prismaService = module.get(PrismaService) as jest.Mocked<PrismaService>;

    // Setup logger spies
    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================================================
  // LOG METHOD TESTS
  // ============================================================================

  describe('log', () => {
    it('debería crear un registro de auditoría correctamente', async () => {
      // Arrange
      prismaService.auditLog.create.mockResolvedValue(mockAuditLog as any);

      // Act
      await service.log(mockAuditLogData);

      // Assert
      expect(prismaService.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          superAdminId: 'admin-123',
          superAdminEmail: 'admin@test.com',
          action: 'create_organization',
          resource: 'organization',
          success: true,
        }),
      });
    });

    it('debería loggear en consola para acciones críticas', async () => {
      // Arrange
      const criticalAction: AuditLogData = {
        ...mockAuditLogData,
        action: 'delete_organization',
      };
      prismaService.auditLog.create.mockResolvedValue(mockAuditLog as any);

      // Act
      await service.log(criticalAction);

      // Assert
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('🔥 CRITICAL AUDIT'),
      );
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('delete_organization'),
      );
    });

    it('debería loggear en consola para change_plan', async () => {
      // Arrange
      const criticalAction: AuditLogData = {
        ...mockAuditLogData,
        action: 'change_plan',
      };
      prismaService.auditLog.create.mockResolvedValue(mockAuditLog as any);

      // Act
      await service.log(criticalAction);

      // Assert
      expect(loggerWarnSpy).toHaveBeenCalled();
    });

    it('debería loggear en consola para delete_user', async () => {
      // Arrange
      const criticalAction: AuditLogData = {
        ...mockAuditLogData,
        action: 'delete_user',
      };
      prismaService.auditLog.create.mockResolvedValue(mockAuditLog as any);

      // Act
      await service.log(criticalAction);

      // Assert
      expect(loggerWarnSpy).toHaveBeenCalled();
    });

    it('no debería loggear en consola para acciones no críticas', async () => {
      // Arrange
      prismaService.auditLog.create.mockResolvedValue(mockAuditLog as any);

      // Act
      await service.log(mockAuditLogData);

      // Assert
      expect(loggerWarnSpy).not.toHaveBeenCalled();
    });

    it('debería manejar campos opcionales vacíos', async () => {
      // Arrange
      const minimalData: AuditLogData = {
        superAdminId: 'admin-123',
        superAdminEmail: 'admin@test.com',
        superAdminName: 'Test Admin',
        action: 'login',
        resource: 'auth',
        method: 'POST',
        endpoint: '/admin/login',
        ipAddress: '192.168.1.1',
        statusCode: 200,
        success: true,
      };
      prismaService.auditLog.create.mockResolvedValue(mockAuditLog as any);

      // Act
      await service.log(minimalData);

      // Assert
      expect(prismaService.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          changes: undefined,
          metadata: undefined,
          resourceId: undefined,
        }),
      });
    });

    it('debería lanzar error si falla la creación', async () => {
      // Arrange
      const error = new Error('Database error');
      prismaService.auditLog.create.mockRejectedValue(error);

      // Act & Assert
      await expect(service.log(mockAuditLogData)).rejects.toThrow('Database error');
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('FAILED TO CREATE AUDIT LOG'),
        error,
      );
    });
  });

  // ============================================================================
  // FINDALL METHOD TESTS
  // ============================================================================

  describe('findAll', () => {
    it('debería obtener logs con paginación por defecto', async () => {
      // Arrange
      const mockLogs = [mockAuditLog, { ...mockAuditLog, id: 'audit-456' }];
      prismaService.auditLog.findMany.mockResolvedValue(mockLogs as any);
      prismaService.auditLog.count.mockResolvedValue(100);

      // Act
      const result = await service.findAll({});

      // Assert
      expect(result.data).toHaveLength(2);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 50,
        total: 100,
        totalPages: 2,
      });
      expect(prismaService.auditLog.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { timestamp: 'desc' },
        skip: 0,
        take: 50,
        include: expect.any(Object),
      });
    });

    it('debería filtrar por email de super admin', async () => {
      // Arrange
      prismaService.auditLog.findMany.mockResolvedValue([mockAuditLog] as any);
      prismaService.auditLog.count.mockResolvedValue(1);

      // Act
      await service.findAll({ superAdminEmail: 'admin@test.com' });

      // Assert
      const call = prismaService.auditLog.findMany.mock.calls[0][0];
      expect(call.where.superAdminEmail).toBe('admin@test.com');
    });

    it('debería filtrar por acción', async () => {
      // Arrange
      prismaService.auditLog.findMany.mockResolvedValue([mockAuditLog] as any);
      prismaService.auditLog.count.mockResolvedValue(1);

      // Act
      await service.findAll({ action: 'create_organization' });

      // Assert
      const call = prismaService.auditLog.findMany.mock.calls[0][0];
      expect(call.where.action).toBe('create_organization');
    });

    it('debería filtrar por organizationId', async () => {
      // Arrange
      prismaService.auditLog.findMany.mockResolvedValue([mockAuditLog] as any);
      prismaService.auditLog.count.mockResolvedValue(1);

      // Act
      await service.findAll({ organizationId: 'org-123' });

      // Assert
      const call = prismaService.auditLog.findMany.mock.calls[0][0];
      expect(call.where.organizationId).toBe('org-123');
    });

    it('debería filtrar por success', async () => {
      // Arrange
      prismaService.auditLog.findMany.mockResolvedValue([mockAuditLog] as any);
      prismaService.auditLog.count.mockResolvedValue(1);

      // Act
      await service.findAll({ success: true });

      // Assert
      const call = prismaService.auditLog.findMany.mock.calls[0][0];
      expect(call.where.success).toBe(true);
    });

    it('debería filtrar por rango de fechas (startDate)', async () => {
      // Arrange
      const startDate = new Date('2024-01-01');
      prismaService.auditLog.findMany.mockResolvedValue([mockAuditLog] as any);
      prismaService.auditLog.count.mockResolvedValue(1);

      // Act
      await service.findAll({ startDate });

      // Assert
      const call = prismaService.auditLog.findMany.mock.calls[0][0];
      expect(call.where.timestamp.gte).toEqual(startDate);
    });

    it('debería filtrar por rango de fechas (endDate)', async () => {
      // Arrange
      const endDate = new Date('2024-12-31');
      prismaService.auditLog.findMany.mockResolvedValue([mockAuditLog] as any);
      prismaService.auditLog.count.mockResolvedValue(1);

      // Act
      await service.findAll({ endDate });

      // Assert
      const call = prismaService.auditLog.findMany.mock.calls[0][0];
      expect(call.where.timestamp.lte).toEqual(endDate);
    });

    it('debería filtrar por rango de fechas completo', async () => {
      // Arrange
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');
      prismaService.auditLog.findMany.mockResolvedValue([mockAuditLog] as any);
      prismaService.auditLog.count.mockResolvedValue(1);

      // Act
      await service.findAll({ startDate, endDate });

      // Assert
      const call = prismaService.auditLog.findMany.mock.calls[0][0];
      expect(call.where.timestamp).toEqual({
        gte: startDate,
        lte: endDate,
      });
    });

    it('debería manejar paginación personalizada', async () => {
      // Arrange
      prismaService.auditLog.findMany.mockResolvedValue([mockAuditLog] as any);
      prismaService.auditLog.count.mockResolvedValue(200);

      // Act
      const result = await service.findAll({ page: 3, limit: 20 });

      // Assert
      expect(result.pagination).toEqual({
        page: 3,
        limit: 20,
        total: 200,
        totalPages: 10,
      });
      const call = prismaService.auditLog.findMany.mock.calls[0][0];
      expect(call.skip).toBe(40); // (3 - 1) * 20
      expect(call.take).toBe(20);
    });

    it('debería incluir información de organización', async () => {
      // Arrange
      const mockLogWithOrg = {
        ...mockAuditLog,
        organization: {
          id: 'org-123',
          name: 'Test Org',
          slug: 'test-org',
        },
      };
      prismaService.auditLog.findMany.mockResolvedValue([mockLogWithOrg] as any);
      prismaService.auditLog.count.mockResolvedValue(1);

      // Act
      const result = await service.findAll({});

      // Assert
      expect(result.data[0].organization).toBeDefined();
      expect(prismaService.auditLog.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { timestamp: 'desc' },
        skip: 0,
        take: 50,
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });
    });
  });

  // ============================================================================
  // GETSTATS METHOD TESTS
  // ============================================================================

  describe('getStats', () => {
    it('debería obtener estadísticas completas', async () => {
      // Arrange
      prismaService.auditLog.count
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(85)  // successful
        .mockResolvedValueOnce(15); // failed

      prismaService.auditLog.findMany.mockResolvedValue([
        { superAdminEmail: 'admin1@test.com' },
        { superAdminEmail: 'admin2@test.com' },
      ] as any);

      prismaService.auditLog.groupBy
        .mockResolvedValueOnce([ // actions by type
          { action: 'create_org', _count: { action: 50 } },
          { action: 'delete_user', _count: { action: 30 } },
        ] as any)
        .mockResolvedValueOnce([ // actions by organization
          { organizationId: 'org-1', _count: { organizationId: 40 } },
          { organizationId: 'org-2', _count: { organizationId: 20 } },
        ] as any);

      // Act
      const result = await service.getStats({});

      // Assert
      expect(result).toEqual({
        total: 100,
        successful: 85,
        failed: 15,
        successRate: 85,
        uniqueAdmins: 2,
        topActions: [
          { action: 'create_org', count: 50 },
          { action: 'delete_user', count: 30 },
        ],
        topOrganizations: [
          { organizationId: 'org-1', count: 40 },
          { organizationId: 'org-2', count: 20 },
        ],
      });
    });

    it('debería calcular successRate correctamente cuando hay 0 acciones', async () => {
      // Arrange
      prismaService.auditLog.count
        .mockResolvedValueOnce(0)  // total
        .mockResolvedValueOnce(0)  // successful
        .mockResolvedValueOnce(0); // failed

      prismaService.auditLog.findMany.mockResolvedValue([]);
      prismaService.auditLog.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      // Act
      const result = await service.getStats({});

      // Assert
      expect(result.successRate).toBe(0);
      expect(result.total).toBe(0);
    });

    it('debería filtrar por startDate', async () => {
      // Arrange
      const startDate = new Date('2024-01-01');
      prismaService.auditLog.count
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(8)
        .mockResolvedValueOnce(2);
      prismaService.auditLog.findMany.mockResolvedValue([]);
      prismaService.auditLog.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      // Act
      await service.getStats({ startDate });

      // Assert
      const countCalls = prismaService.auditLog.count.mock.calls;
      expect(countCalls[0][0].where.timestamp.gte).toEqual(startDate);
    });

    it('debería filtrar por endDate', async () => {
      // Arrange
      const endDate = new Date('2024-12-31');
      prismaService.auditLog.count
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(8)
        .mockResolvedValueOnce(2);
      prismaService.auditLog.findMany.mockResolvedValue([]);
      prismaService.auditLog.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      // Act
      await service.getStats({ endDate });

      // Assert
      const countCalls = prismaService.auditLog.count.mock.calls;
      expect(countCalls[0][0].where.timestamp.lte).toEqual(endDate);
    });

    it('debería obtener top 10 acciones ordenadas', async () => {
      // Arrange
      prismaService.auditLog.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(85)
        .mockResolvedValueOnce(15);
      prismaService.auditLog.findMany.mockResolvedValue([]);
      prismaService.auditLog.groupBy
        .mockResolvedValueOnce([
          { action: 'action1', _count: { action: 100 } },
        ] as any)
        .mockResolvedValueOnce([]);

      // Act
      await service.getStats({});

      // Assert
      const groupByCalls = prismaService.auditLog.groupBy.mock.calls;
      expect(groupByCalls[0][0]).toEqual({
        by: ['action'],
        where: {},
        _count: { action: true },
        orderBy: { _count: { action: 'desc' } },
        take: 10,
      });
    });

    it('debería obtener top 10 organizaciones ordenadas', async () => {
      // Arrange
      prismaService.auditLog.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(85)
        .mockResolvedValueOnce(15);
      prismaService.auditLog.findMany.mockResolvedValue([]);
      prismaService.auditLog.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { organizationId: 'org-1', _count: { organizationId: 50 } },
        ] as any);

      // Act
      await service.getStats({});

      // Assert
      const groupByCalls = prismaService.auditLog.groupBy.mock.calls;
      expect(groupByCalls[1][0]).toEqual({
        by: ['organizationId'],
        where: { organizationId: { not: null } },
        _count: { organizationId: true },
        orderBy: { _count: { organizationId: 'desc' } },
        take: 10,
      });
    });
  });

  // ============================================================================
  // GETCLIENTIP METHOD TESTS
  // ============================================================================

  describe('getClientIP', () => {
    it('debería extraer IP de x-forwarded-for (string)', () => {
      // Arrange
      const mockRequest = {
        headers: {
          'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178',
        },
        socket: { remoteAddress: '192.168.1.1' },
      } as any;

      // Act
      const ip = service.getClientIP(mockRequest);

      // Assert
      expect(ip).toBe('203.0.113.195');
    });

    it('debería extraer IP de x-forwarded-for (array)', () => {
      // Arrange
      const mockRequest = {
        headers: {
          'x-forwarded-for': ['203.0.113.195'],
        },
        socket: { remoteAddress: '192.168.1.1' },
      } as any;

      // Act
      const ip = service.getClientIP(mockRequest);

      // Assert
      expect(ip).toBe('203.0.113.195');
    });

    it('debería extraer IP de x-real-ip (string)', () => {
      // Arrange
      const mockRequest = {
        headers: {
          'x-real-ip': '203.0.113.195',
        },
        socket: { remoteAddress: '192.168.1.1' },
      } as any;

      // Act
      const ip = service.getClientIP(mockRequest);

      // Assert
      expect(ip).toBe('203.0.113.195');
    });

    it('debería extraer IP de x-real-ip (array)', () => {
      // Arrange
      const mockRequest = {
        headers: {
          'x-real-ip': ['203.0.113.195'],
        },
        socket: { remoteAddress: '192.168.1.1' },
      } as any;

      // Act
      const ip = service.getClientIP(mockRequest);

      // Assert
      expect(ip).toBe('203.0.113.195');
    });

    it('debería usar remoteAddress como fallback', () => {
      // Arrange
      const mockRequest = {
        headers: {},
        socket: { remoteAddress: '192.168.1.1' },
      } as any;

      // Act
      const ip = service.getClientIP(mockRequest);

      // Assert
      expect(ip).toBe('192.168.1.1');
    });

    it('debería retornar "unknown" si no hay IP disponible', () => {
      // Arrange
      const mockRequest = {
        headers: {},
        socket: {},
      } as any;

      // Act
      const ip = service.getClientIP(mockRequest);

      // Assert
      expect(ip).toBe('unknown');
    });

    it('debería hacer trim de espacios en x-forwarded-for', () => {
      // Arrange
      const mockRequest = {
        headers: {
          'x-forwarded-for': '  203.0.113.195  , 70.41.3.18',
        },
        socket: { remoteAddress: '192.168.1.1' },
      } as any;

      // Act
      const ip = service.getClientIP(mockRequest);

      // Assert
      expect(ip).toBe('203.0.113.195');
    });

    it('debería priorizar x-forwarded-for sobre x-real-ip', () => {
      // Arrange
      const mockRequest = {
        headers: {
          'x-forwarded-for': '203.0.113.195',
          'x-real-ip': '70.41.3.18',
        },
        socket: { remoteAddress: '192.168.1.1' },
      } as any;

      // Act
      const ip = service.getClientIP(mockRequest);

      // Assert
      expect(ip).toBe('203.0.113.195');
    });

    it('debería priorizar x-real-ip sobre remoteAddress', () => {
      // Arrange
      const mockRequest = {
        headers: {
          'x-real-ip': '203.0.113.195',
        },
        socket: { remoteAddress: '192.168.1.1' },
      } as any;

      // Act
      const ip = service.getClientIP(mockRequest);

      // Assert
      expect(ip).toBe('203.0.113.195');
    });
  });
});
