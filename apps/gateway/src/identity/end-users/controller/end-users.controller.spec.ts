import { DEFAULT_PAGE_SIZE } from '@tesseract/types';
import { Test, TestingModule } from '@nestjs/testing';
import { EndUsersController } from './end-users.controller';
import { EndUsersService } from '../end-users.service';
import { UserPayload } from '@/platform/common/types/jwt-payload.type';
import { Reflector } from '@nestjs/core';

// ─── Mock del servicio ─────────────────────────────────────────────
const mockEndUsersService = {
  getDashboardData: jest.fn(),
  block: jest.fn(),
  unblock: jest.fn(),
};

describe('EndUsersController', () => {
  let controller: EndUsersController;
  let service: EndUsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EndUsersController],
      providers: [{ provide: EndUsersService, useValue: mockEndUsersService }, Reflector],
    }).compile();

    controller = module.get<EndUsersController>(EndUsersController);
    service = module.get<EndUsersService>(EndUsersService);

    jest.clearAllMocks();
  });

  // ─── Mock de usuario autenticado ─────────────────────────────
  const mockUser: UserPayload = {
    sub: 'user-1',
    email: 'admin@example.com',
    name: 'Admin User',
    role: 'OWNER',
    organizationId: 'org-123',
  };

  // ─── Mock de Response de Express ─────────────────────────────
  const createMockResponse = () => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    return res as any;
  };

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════════
  // GET /end-users/dashboard
  // ═══════════════════════════════════════════════════════════════
  describe('getDashboardData', () => {
    const mockPaginatedData = {
      items: [
        {
          id: 'eu-1',
          phoneNumber: '5215512345678',
          email: 'john@example.com',
          externalId: 'ext-1',
          name: 'John Doe',
          avatar: null,
          metadata: null,
          lastSeenAt: new Date('2026-03-01'),
          createdAt: new Date('2026-01-15'),
          blockedAt: null,
          blockedReason: null,
          blockedByName: null,
        },
      ],
      nextCursor: null,
      prevCursor: null,
      nextPageAvailable: false,
      pageSize: 10,
    };

    // ─── Caso 1: Llamada exitosa con parámetros por defecto ────
    it('should call service with user organizationId and return 200', async () => {
      mockEndUsersService.getDashboardData.mockResolvedValue(mockPaginatedData);
      const res = createMockResponse();

      await controller.getDashboardData(mockUser, {}, res);

      // Verifica que pasa el organizationId del usuario autenticado
      expect(service.getDashboardData).toHaveBeenCalledWith(
        'org-123', // ← del mockUser.organizationId
        null, // cursor
        DEFAULT_PAGE_SIZE, // pageSize
        null, // paginationAction
        { search: undefined, blocked: undefined },
      );

      // Verifica response HTTP
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockPaginatedData,
          message: 'Dashboard end users data retrieved successfully',
        }),
      );
    });

    // ─── Caso 2: Pasa los query params correctamente ───────────
    it('should forward cursor, pagination, search and block filter to the service', async () => {
      mockEndUsersService.getDashboardData.mockResolvedValue(mockPaginatedData);
      const res = createMockResponse();

      await controller.getDashboardData(
        mockUser,
        {
          cursor: 'eu-cursor-123',
          pageSize: 25,
          paginationAction: 'next',
          search: 'Jane',
          blocked: 'blocked',
        },
        res,
      );

      expect(service.getDashboardData).toHaveBeenCalledWith('org-123', 'eu-cursor-123', 25, 'next', {
        search: 'Jane',
        blocked: 'blocked',
      });
    });

    // ─── Caso 3: Paginación hacia atrás ────────────────────────
    it('should forward prev pagination action to the service', async () => {
      mockEndUsersService.getDashboardData.mockResolvedValue(mockPaginatedData);
      const res = createMockResponse();

      await controller.getDashboardData(
        mockUser,
        { cursor: 'eu-cursor-456', paginationAction: 'prev' },
        res,
      );

      expect(service.getDashboardData).toHaveBeenCalledWith(
        'org-123',
        'eu-cursor-456',
        DEFAULT_PAGE_SIZE,
        'prev',
        { search: undefined, blocked: undefined },
      );
    });

    // ─── Caso 4: El servicio lanza una excepción ───────────────
    it('should propagate service errors', async () => {
      const error = new Error('Database error');
      mockEndUsersService.getDashboardData.mockRejectedValue(error);
      const res = createMockResponse();

      await expect(controller.getDashboardData(mockUser, {}, res)).rejects.toThrow(
        'Database error',
      );

      // No debería haber intentado enviar respuesta
      expect(res.status).not.toHaveBeenCalled();
    });

    // ─── Caso 5: Response contiene la estructura ApiResponse ───
    it('should return a properly structured ApiResponse', async () => {
      const emptyData = {
        items: [],
        nextCursor: null,
        prevCursor: null,
        nextPageAvailable: false,
        pageSize: 10,
      };
      mockEndUsersService.getDashboardData.mockResolvedValue(emptyData);
      const res = createMockResponse();

      await controller.getDashboardData(mockUser, {}, res);

      const responseBody = res.json.mock.calls[0][0];

      expect(responseBody).toHaveProperty('success', true);
      expect(responseBody).toHaveProperty('data', emptyData);
      expect(responseBody).toHaveProperty('message');
      expect(responseBody).toHaveProperty('timestamp');
      expect(typeof responseBody.timestamp).toBe('string');
    });

    // ─── Caso 6: Usa el organizationId del usuario correcto ────
    it('should use the organization from the authenticated user, not a hardcoded value', async () => {
      const differentUser: UserPayload = {
        sub: 'user-999',
        email: 'other@example.com',
        name: 'Other User',
        role: 'ADMIN',
        organizationId: 'org-different-456',
      };
      mockEndUsersService.getDashboardData.mockResolvedValue(mockPaginatedData);
      const res = createMockResponse();

      await controller.getDashboardData(differentUser, {}, res);

      expect(service.getDashboardData).toHaveBeenCalledWith(
        'org-different-456', // ← debe usar el org del usuario actual
        null,
        DEFAULT_PAGE_SIZE,
        null,
        { search: undefined, blocked: undefined },
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // POST /end-users/:id/block · /unblock
  // ═══════════════════════════════════════════════════════════════
  describe('block', () => {
    it('should pass the organization, the contact, who blocked and the reason', async () => {
      mockEndUsersService.block.mockResolvedValue({ id: 'eu-1' });
      const res = createMockResponse();

      await controller.block(mockUser, 'eu-1', { reason: 'Spam' }, res);

      // `user.sub` es quien queda registrado como autor del bloqueo.
      expect(service.block).toHaveBeenCalledWith('org-123', 'eu-1', 'user-1', 'Spam');
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should allow blocking without a reason', async () => {
      mockEndUsersService.block.mockResolvedValue({ id: 'eu-1' });
      const res = createMockResponse();

      await controller.block(mockUser, 'eu-1', {}, res);

      expect(service.block).toHaveBeenCalledWith('org-123', 'eu-1', 'user-1', undefined);
    });
  });

  describe('unblock', () => {
    it('should pass the organization and the contact', async () => {
      mockEndUsersService.unblock.mockResolvedValue({ id: 'eu-1' });
      const res = createMockResponse();

      await controller.unblock(mockUser, 'eu-1', res);

      expect(service.unblock).toHaveBeenCalledWith('org-123', 'eu-1');
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});
