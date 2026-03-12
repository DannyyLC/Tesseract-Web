import { Test, TestingModule } from '@nestjs/testing';
import { EndUsersController } from './end-users.controller';
import { EndUsersService } from '../end-users.service';
import { UserPayload } from '../../common/types/jwt-payload.type';
import { Reflector } from '@nestjs/core';

// ─── Mock del servicio ─────────────────────────────────────────────
const mockEndUsersService = {
  getDashboardData: jest.fn(),
};

describe('EndUsersController', () => {
  let controller: EndUsersController;
  let service: EndUsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EndUsersController],
      providers: [
        { provide: EndUsersService, useValue: mockEndUsersService },
        Reflector,
      ],
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
          phoneNumber: '+5215512345678',
          email: 'john@example.com',
          externalId: 'ext-1',
          name: 'John Doe',
          avatar: null,
          metadata: null,
          lastSeenAt: new Date('2026-03-01'),
          createdAt: new Date('2026-01-15'),
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

      await controller.getDashboardData(mockUser, null, 10, null, res);

      // Verifica que pasa el organizationId del usuario autenticado
      expect(service.getDashboardData).toHaveBeenCalledWith(
        'org-123',  // ← del mockUser.organizationId
        null,       // cursor
        10,         // pageSize
        null,       // paginationAction
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
    it('should forward cursor and pagination params to the service', async () => {
      mockEndUsersService.getDashboardData.mockResolvedValue(mockPaginatedData);
      const res = createMockResponse();

      await controller.getDashboardData(
        mockUser,
        'eu-cursor-123',  // cursor
        25,               // pageSize
        'next',           // paginationAction
        res,
      );

      expect(service.getDashboardData).toHaveBeenCalledWith(
        'org-123',
        'eu-cursor-123',
        25,
        'next',
      );
    });

    // ─── Caso 3: Paginación hacia atrás ────────────────────────
    it('should forward prev pagination action to the service', async () => {
      mockEndUsersService.getDashboardData.mockResolvedValue(mockPaginatedData);
      const res = createMockResponse();

      await controller.getDashboardData(
        mockUser,
        'eu-cursor-456',
        10,
        'prev',
        res,
      );

      expect(service.getDashboardData).toHaveBeenCalledWith(
        'org-123',
        'eu-cursor-456',
        10,
        'prev',
      );
    });

    // ─── Caso 4: El servicio lanza una excepción ───────────────
    it('should propagate service errors', async () => {
      const error = new Error('Database error');
      mockEndUsersService.getDashboardData.mockRejectedValue(error);
      const res = createMockResponse();

      await expect(
        controller.getDashboardData(mockUser, null, 10, null, res),
      ).rejects.toThrow('Database error');

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

      await controller.getDashboardData(mockUser, null, 10, null, res);

      const responseBody = res.json.mock.calls[0][0];

      // Verifica estructura completa de ApiResponse
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

      await controller.getDashboardData(differentUser, null, 10, null, res);

      expect(service.getDashboardData).toHaveBeenCalledWith(
        'org-different-456', // ← debe usar el org del usuario actual
        null,
        10,
        null,
      );
    });
  });
});
