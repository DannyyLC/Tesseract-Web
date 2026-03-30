import { Test, TestingModule } from '@nestjs/testing';
import { EndUsersService } from './end-users.service';
import { PrismaService } from '../database/prisma.service';
import { CursorPaginatedResponseUtils } from '../common/responses/cursor-paginated-response';

// ─── Mock de CursorPaginatedResponseUtils (singleton) ──────────────
const mockBuild = jest.fn();
jest.spyOn(CursorPaginatedResponseUtils, 'getInstance').mockReturnValue({
  build: mockBuild,
} as unknown as CursorPaginatedResponseUtils);

// ─── Mock de PrismaService ─────────────────────────────────────────
const mockPrismaService = {
  endUser: {
    findMany: jest.fn(),
  },
};

describe('EndUsersService', () => {
  let service: EndUsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EndUsersService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<EndUsersService>(EndUsersService);

    // Limpiar mocks entre tests
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════════
  // getDashboardData
  // ═══════════════════════════════════════════════════════════════
  describe('getDashboardData', () => {
    const organizationId = 'org-123';

    const mockEndUsers = [
      {
        id: 'eu-1',
        phoneNumber: '+5215512345678',
        email: 'john@example.com',
        externalId: 'ext-1',
        name: 'John Doe',
        avatar: null,
        metadata: null,
        lastSeenAt: new Date('2026-03-01'),
        createdAt: new Date('2026-01-15'),
      },
      {
        id: 'eu-2',
        phoneNumber: '+5215587654321',
        email: 'jane@example.com',
        externalId: 'ext-2',
        name: 'Jane Smith',
        avatar: 'https://example.com/avatar.jpg',
        metadata: { source: 'whatsapp' },
        lastSeenAt: new Date('2026-03-10'),
        createdAt: new Date('2026-02-20'),
      },
    ];

    const mockPaginatedResponse = {
      items: mockEndUsers,
      nextCursor: null,
      prevCursor: null,
      nextPageAvailable: false,
      pageSize: 10,
    };

    // ─── Caso 1: Llamada con valores por defecto ───────────────
    it('should return paginated end users with default parameters', async () => {
      mockPrismaService.endUser.findMany.mockResolvedValue(mockEndUsers);
      mockBuild.mockResolvedValue(mockPaginatedResponse);

      const result = await service.getDashboardData(organizationId);

      // Verificar que Prisma fue llamado con los parámetros correctos
      expect(mockPrismaService.endUser.findMany).toHaveBeenCalledWith({
        where: { organizationId },
        skip: 0,           // sin cursor → skip 0
        take: 11,          // pageSize (10) + 1 para detectar next page
        cursor: undefined, // sin cursor
        select: {
          id: true,
          phoneNumber: true,
          email: true,
          externalId: true,
          name: true,
          avatar: true,
          metadata: true,
          lastSeenAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      // Verificar que CursorPaginatedResponseUtils fue llamado correctamente
      expect(mockBuild).toHaveBeenCalledWith(mockEndUsers, 10, null);

      // Verificar resultado
      expect(result).toEqual(mockPaginatedResponse);
    });

    // ─── Caso 2: Con cursor (paginación next) ──────────────────
    it('should pass cursor and skip 1 when cursor is provided', async () => {
      const cursor = 'eu-1';
      mockPrismaService.endUser.findMany.mockResolvedValue(mockEndUsers);
      mockBuild.mockResolvedValue(mockPaginatedResponse);

      await service.getDashboardData(organizationId, cursor, 10, 'next');

      expect(mockPrismaService.endUser.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 1,                    // con cursor → skip 1
          cursor: { id: cursor },     // cursor activo
          take: 11,                   // next → positivo (pageSize + 1)
        }),
      );

      expect(mockBuild).toHaveBeenCalledWith(mockEndUsers, 10, 'next');
    });

    // ─── Caso 3: Con paginación prev ───────────────────────────
    it('should use negative take when paginationAction is prev', async () => {
      const cursor = 'eu-2';
      mockPrismaService.endUser.findMany.mockResolvedValue(mockEndUsers);
      mockBuild.mockResolvedValue(mockPaginatedResponse);

      await service.getDashboardData(organizationId, cursor, 5, 'prev');

      expect(mockPrismaService.endUser.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: -6,                    // prev → -(pageSize + 1)
          cursor: { id: cursor },
          skip: 1,
        }),
      );

      expect(mockBuild).toHaveBeenCalledWith(mockEndUsers, 5, 'prev');
    });

    // ─── Caso 4: pageSize personalizado ────────────────────────
    it('should respect custom pageSize', async () => {
      mockPrismaService.endUser.findMany.mockResolvedValue([]);
      mockBuild.mockResolvedValue({
        items: [],
        nextCursor: null,
        prevCursor: null,
        nextPageAvailable: false,
        pageSize: 25,
      });

      await service.getDashboardData(organizationId, null, 25, null);

      expect(mockPrismaService.endUser.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 26, // 25 + 1
        }),
      );

      expect(mockBuild).toHaveBeenCalledWith([], 25, null);
    });

    // ─── Caso 5: Sin cursor y paginationAction null ────────────
    it('should handle null cursor and null paginationAction', async () => {
      mockPrismaService.endUser.findMany.mockResolvedValue(mockEndUsers);
      mockBuild.mockResolvedValue(mockPaginatedResponse);

      await service.getDashboardData(organizationId, null, 10, null);

      expect(mockPrismaService.endUser.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          cursor: undefined,
          take: 11, // paginationAction null → positivo
        }),
      );
    });

    // ─── Caso 6: Prisma lanza una excepción ────────────────────
    it('should propagate errors from Prisma', async () => {
      const dbError = new Error('Database connection lost');
      mockPrismaService.endUser.findMany.mockRejectedValue(dbError);

      await expect(
        service.getDashboardData(organizationId),
      ).rejects.toThrow('Database connection lost');

      expect(mockBuild).not.toHaveBeenCalled();
    });

    // ─── Caso 7: Lista vacía ───────────────────────────────────
    it('should return empty paginated response when no end users exist', async () => {
      const emptyResponse = {
        items: [],
        nextCursor: null,
        prevCursor: null,
        nextPageAvailable: false,
        pageSize: 10,
      };
      mockPrismaService.endUser.findMany.mockResolvedValue([]);
      mockBuild.mockResolvedValue(emptyResponse);

      const result = await service.getDashboardData(organizationId);

      expect(result).toEqual(emptyResponse);
      expect(result.items).toHaveLength(0);
    });
  });
});
