import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConversationStatus, Prisma } from '@tesseract/database';
import { EndUsersService } from './end-users.service';
import { PrismaService } from '@/platform/database/prisma.service';
import { CursorPaginatedResponseUtils } from '@/platform/common/responses/cursor-paginated-response';

// ─── Mock de CursorPaginatedResponseUtils (singleton) ──────────────
const mockBuild = jest.fn();
jest.spyOn(CursorPaginatedResponseUtils, 'getInstance').mockReturnValue({
  build: mockBuild,
});

// ─── Mock de PrismaService ─────────────────────────────────────────
const mockPrismaService = {
  endUser: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  conversation: {
    updateMany: jest.fn(),
  },
  $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
};

/** Simula el error que lanza Prisma cuando la llave única (organizationId, phoneNumber) choca. */
function uniqueConstraintError() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

/** Columnas que el listado pide a Prisma. Se comparte con las aserciones. */
const EXPECTED_SELECT = {
  id: true,
  phoneNumber: true,
  email: true,
  externalId: true,
  name: true,
  avatar: true,
  metadata: true,
  lastSeenAt: true,
  createdAt: true,
  blockedAt: true,
  blockedReason: true,
  blockedBy: { select: { name: true } },
};

const EXPECTED_ORDER_BY = [{ lastSeenAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }];

describe('EndUsersService', () => {
  let service: EndUsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EndUsersService, { provide: PrismaService, useValue: mockPrismaService }],
    }).compile();

    service = module.get<EndUsersService>(EndUsersService);

    jest.clearAllMocks();
    mockPrismaService.$transaction.mockImplementation((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );
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
        blockedBy: null,
      },
      {
        id: 'eu-2',
        phoneNumber: '5215587654321',
        email: 'jane@example.com',
        externalId: 'ext-2',
        name: 'Jane Smith',
        avatar: 'https://example.com/avatar.jpg',
        metadata: { source: 'whatsapp' },
        lastSeenAt: new Date('2026-03-10'),
        createdAt: new Date('2026-02-20'),
        blockedAt: new Date('2026-03-11'),
        blockedReason: 'Spam',
        blockedBy: { name: 'Daniel' },
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

      expect(mockPrismaService.endUser.findMany).toHaveBeenCalledWith({
        where: { organizationId },
        skip: 0, // sin cursor → skip 0
        take: 11, // pageSize (10) + 1 para detectar next page
        cursor: undefined, // sin cursor
        select: EXPECTED_SELECT,
        orderBy: EXPECTED_ORDER_BY,
      });

      expect(mockBuild).toHaveBeenCalledWith(mockEndUsers, 10, null);

      // `blockedBy` es una relación anidada y no viaja al cliente: se aplana a un nombre.
      expect(result.items[1]).toMatchObject({ id: 'eu-2', blockedByName: 'Daniel' });
      expect(result.items[1]).not.toHaveProperty('blockedBy');
      expect(result.items[0].blockedByName).toBeNull();
    });

    // ─── Caso 2: Con cursor (paginación next) ──────────────────
    it('should pass cursor and skip 1 when cursor is provided', async () => {
      const cursor = 'eu-1';
      mockPrismaService.endUser.findMany.mockResolvedValue(mockEndUsers);
      mockBuild.mockResolvedValue(mockPaginatedResponse);

      await service.getDashboardData(organizationId, cursor, 10, 'next');

      expect(mockPrismaService.endUser.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 1, // con cursor → skip 1
          cursor: { id: cursor }, // cursor activo
          take: 11, // next → positivo (pageSize + 1)
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
          take: -6, // prev → -(pageSize + 1)
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
        expect.objectContaining({ take: 26 }),
      );

      expect(mockBuild).toHaveBeenCalledWith([], 25, null);
    });

    // ─── Caso 5: Prisma lanza una excepción ────────────────────
    it('should propagate errors from Prisma', async () => {
      const dbError = new Error('Database connection lost');
      mockPrismaService.endUser.findMany.mockRejectedValue(dbError);

      await expect(service.getDashboardData(organizationId)).rejects.toThrow(
        'Database connection lost',
      );

      expect(mockBuild).not.toHaveBeenCalled();
    });

    // ─── Caso 6: Lista vacía ───────────────────────────────────
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

      expect(result.items).toHaveLength(0);
    });

    // ─── Filtro por estado de bloqueo ──────────────────────────
    it.each([
      ['blocked' as const, { blockedAt: { not: null } }],
      ['active' as const, { blockedAt: null }],
    ])('should narrow the query when filtering by %s', async (blocked, expected) => {
      mockPrismaService.endUser.findMany.mockResolvedValue([]);
      mockBuild.mockResolvedValue({ items: [] });

      await service.getDashboardData(organizationId, null, 10, null, { blocked });

      expect(mockPrismaService.endUser.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId, ...expected } }),
      );
    });

    it('should not filter by block state when asking for all', async () => {
      mockPrismaService.endUser.findMany.mockResolvedValue([]);
      mockBuild.mockResolvedValue({ items: [] });

      await service.getDashboardData(organizationId, null, 10, null, { blocked: 'all' });

      expect(mockPrismaService.endUser.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId } }),
      );
    });

    // ─── Búsqueda ──────────────────────────────────────────────
    it('should strip everything but digits before matching a phone number', async () => {
      mockPrismaService.endUser.findMany.mockResolvedValue([]);
      mockBuild.mockResolvedValue({ items: [] });

      // Es el caso que motiva el despojado: en la base vive `5215512345678`, sin `+` ni espacios.
      await service.getDashboardData(organizationId, null, 10, null, {
        search: '+52 1 55 1234 5678',
      });

      expect(mockPrismaService.endUser.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId,
            OR: [
              { name: { contains: '+52 1 55 1234 5678', mode: 'insensitive' } },
              { email: { contains: '+52 1 55 1234 5678', mode: 'insensitive' } },
              { externalId: { contains: '+52 1 55 1234 5678', mode: 'insensitive' } },
              { phoneNumber: { contains: '5215512345678' } },
            ],
          },
        }),
      );
    });

    /**
     * El match es por subcadena, y eso es lo que salva a la búsqueda de la forma en que México
     * escribe sus números: WhatsApp guarda `5215512345678` —con el `1` de móvil que mete Meta—
     * así que teclear el número "bonito" (`+52 55 1234 5678` → `525512345678`) NO empata. Lo que
     * sí empata, y es como la gente busca, son los últimos dígitos.
     */
    it('should match a phone number by its trailing digits', async () => {
      mockPrismaService.endUser.findMany.mockResolvedValue([]);
      mockBuild.mockResolvedValue({ items: [] });

      await service.getDashboardData(organizationId, null, 10, null, { search: '55 1234 5678' });

      const call = mockPrismaService.endUser.findMany.mock.calls[0][0];
      expect(call.where.OR).toContainEqual({ phoneNumber: { contains: '5512345678' } });
      // Y esos dígitos son, en efecto, una subcadena de lo que guarda el webhook.
      expect('5215512345678').toContain('5512345678');
    });

    it('should skip the phone branch when the term has no digits', async () => {
      mockPrismaService.endUser.findMany.mockResolvedValue([]);
      mockBuild.mockResolvedValue({ items: [] });

      await service.getDashboardData(organizationId, null, 10, null, { search: 'Jane' });

      const call = mockPrismaService.endUser.findMany.mock.calls[0][0];
      expect(call.where.OR).toHaveLength(3);
      expect(JSON.stringify(call.where.OR)).not.toContain('phoneNumber');
    });

    it('should ignore a blank search term', async () => {
      mockPrismaService.endUser.findMany.mockResolvedValue([]);
      mockBuild.mockResolvedValue({ items: [] });

      await service.getDashboardData(organizationId, null, 10, null, { search: '   ' });

      expect(mockPrismaService.endUser.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId } }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // isBlocked / isBlockedById
  // ═══════════════════════════════════════════════════════════════
  describe('isBlocked', () => {
    const organizationId = 'org-123';

    it('should look the contact up by its WhatsApp phone number', async () => {
      mockPrismaService.endUser.findUnique.mockResolvedValue({ blockedAt: new Date() });

      const result = await service.isBlocked(organizationId, { phoneNumber: '+5215512345678' });

      expect(result).toBe(true);
      expect(mockPrismaService.endUser.findUnique).toHaveBeenCalledWith({
        where: {
          organizationId_phoneNumber: { organizationId, phoneNumber: '+5215512345678' },
        },
        select: { blockedAt: true },
      });
    });

    // `EndUser.phoneNumber` vive normalizado ("+dígitos"), pero el webhook manda el número
    // crudo tal cual lo entrega WhatsApp: sin normalizar aquí adentro, este `findUnique` por
    // llave única nunca encontraría la fila y un contacto bloqueado se colaría.
    it('should normalize the phone number before the exact-match lookup', async () => {
      mockPrismaService.endUser.findUnique.mockResolvedValue({ blockedAt: new Date() });

      await service.isBlocked(organizationId, { phoneNumber: '5215512345678' });

      expect(mockPrismaService.endUser.findUnique).toHaveBeenCalledWith({
        where: {
          organizationId_phoneNumber: { organizationId, phoneNumber: '+5215512345678' },
        },
        select: { blockedAt: true },
      });
    });

    it('should look the contact up by its Messenger external id', async () => {
      mockPrismaService.endUser.findUnique.mockResolvedValue({ blockedAt: new Date() });

      const result = await service.isBlocked(organizationId, {
        externalId: 'messenger:page-1:psid-1',
      });

      expect(result).toBe(true);
      expect(mockPrismaService.endUser.findUnique).toHaveBeenCalledWith({
        where: {
          organizationId_externalId: { organizationId, externalId: 'messenger:page-1:psid-1' },
        },
        select: { blockedAt: true },
      });
    });

    it('should report an existing but unblocked contact as not blocked', async () => {
      mockPrismaService.endUser.findUnique.mockResolvedValue({ blockedAt: null });

      await expect(
        service.isBlocked(organizationId, { phoneNumber: '5215512345678' }),
      ).resolves.toBe(false);
    });

    // Quien escribe por primera vez todavía no tiene fila: no bloqueado, y no debe reventar.
    it('should report an unknown contact as not blocked', async () => {
      mockPrismaService.endUser.findUnique.mockResolvedValue(null);

      await expect(
        service.isBlocked(organizationId, { phoneNumber: '5215599999999' }),
      ).resolves.toBe(false);
    });

    it('should resolve the block state by id', async () => {
      mockPrismaService.endUser.findUnique.mockResolvedValue({ blockedAt: new Date() });

      await expect(service.isBlockedById('eu-1')).resolves.toBe(true);
      expect(mockPrismaService.endUser.findUnique).toHaveBeenCalledWith({
        where: { id: 'eu-1' },
        select: { blockedAt: true },
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // block / unblock
  // ═══════════════════════════════════════════════════════════════
  describe('block', () => {
    const organizationId = 'org-123';
    const endUserId = 'eu-1';
    const blockedByUserId = 'user-9';

    const blockedRow = {
      id: endUserId,
      phoneNumber: '5215512345678',
      email: null,
      externalId: null,
      name: 'John Doe',
      avatar: null,
      metadata: null,
      lastSeenAt: new Date('2026-03-01'),
      createdAt: new Date('2026-01-15'),
      blockedAt: new Date('2026-03-12'),
      blockedReason: 'Spam',
      blockedBy: { name: 'Daniel' },
    };

    beforeEach(() => {
      mockPrismaService.endUser.findFirst.mockResolvedValue({ id: endUserId });
      mockPrismaService.endUser.update.mockResolvedValue(blockedRow);
      mockPrismaService.conversation.updateMany.mockResolvedValue({ count: 1 });
    });

    it('should stamp the block and close the active conversations in one transaction', async () => {
      const result = await service.block(organizationId, endUserId, blockedByUserId, 'Spam');

      expect(mockPrismaService.endUser.update).toHaveBeenCalledWith({
        where: { id: endUserId },
        data: expect.objectContaining({
          blockedAt: expect.any(Date),
          blockedReason: 'Spam',
          blockedByUserId,
        }),
        select: expect.any(Object),
      });

      expect(mockPrismaService.conversation.updateMany).toHaveBeenCalledWith({
        where: { endUserId, status: ConversationStatus.ACTIVE, deletedAt: null },
        data: { status: ConversationStatus.CLOSED, closedAt: expect.any(Date) },
      });

      // Las dos escrituras van juntas: un bloqueo sin cierre deja en la bandeja una
      // conversación viva que nadie va a contestar.
      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
      expect(result.blockedByName).toBe('Daniel');
    });

    it.each([
      ['undefined', undefined],
      ['blank', '   '],
    ])('should store a %s reason as null', async (_label, reason) => {
      await service.block(organizationId, endUserId, blockedByUserId, reason);

      expect(mockPrismaService.endUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ blockedReason: null }),
        }),
      );
    });

    it('should trim the reason', async () => {
      await service.block(organizationId, endUserId, blockedByUserId, '  Spam  ');

      expect(mockPrismaService.endUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ blockedReason: 'Spam' }),
        }),
      );
    });

    // Sin esto bastaría con conocer el uuid de un contacto ajeno para bloquearlo.
    it('should refuse to block a contact from another organization', async () => {
      mockPrismaService.endUser.findFirst.mockResolvedValue(null);

      await expect(service.block('otra-org', endUserId, blockedByUserId)).rejects.toThrow(
        NotFoundException,
      );

      expect(mockPrismaService.endUser.update).not.toHaveBeenCalled();
      expect(mockPrismaService.conversation.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('unblock', () => {
    const organizationId = 'org-123';
    const endUserId = 'eu-1';

    it('should clear the three block columns and reopen nothing', async () => {
      mockPrismaService.endUser.findFirst.mockResolvedValue({ id: endUserId });
      mockPrismaService.endUser.update.mockResolvedValue({
        id: endUserId,
        phoneNumber: '5215512345678',
        email: null,
        externalId: null,
        name: null,
        avatar: null,
        metadata: null,
        lastSeenAt: null,
        createdAt: new Date(),
        blockedAt: null,
        blockedReason: null,
        blockedBy: null,
      });

      const result = await service.unblock(organizationId, endUserId);

      expect(mockPrismaService.endUser.update).toHaveBeenCalledWith({
        where: { id: endUserId },
        data: { blockedAt: null, blockedReason: null, blockedByUserId: null },
        select: expect.any(Object),
      });

      // Las conversaciones que cerró el bloqueo se quedan cerradas.
      expect(mockPrismaService.conversation.updateMany).not.toHaveBeenCalled();
      expect(result.blockedAt).toBeNull();
    });

    it('should refuse to unblock a contact from another organization', async () => {
      mockPrismaService.endUser.findFirst.mockResolvedValue(null);

      await expect(service.unblock('otra-org', endUserId)).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.endUser.update).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // createFromPhoneNumber
  // ═══════════════════════════════════════════════════════════════
  describe('createFromPhoneNumber', () => {
    const organizationId = 'org-123';

    it('should create the contact with the given phone number and name', async () => {
      mockPrismaService.endUser.create.mockResolvedValue({
        id: 'eu-1',
        phoneNumber: '+5215512345678',
        email: null,
        externalId: null,
        name: 'John Doe',
        avatar: null,
        metadata: null,
        lastSeenAt: null,
        createdAt: new Date(),
        blockedAt: null,
        blockedReason: null,
        blockedBy: null,
      });

      const result = await service.createFromPhoneNumber(
        organizationId,
        '+5215512345678',
        'John Doe',
      );

      expect(mockPrismaService.endUser.create).toHaveBeenCalledWith({
        data: { organizationId, phoneNumber: '+5215512345678', name: 'John Doe' },
        select: expect.any(Object),
      });
      expect(result.name).toBe('John Doe');
    });

    it.each([
      ['undefined', undefined],
      ['blank', '   '],
    ])('should store a %s name as null', async (_label, name) => {
      mockPrismaService.endUser.create.mockResolvedValue({ id: 'eu-1' });

      await service.createFromPhoneNumber(organizationId, '+5215512345678', name);

      expect(mockPrismaService.endUser.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ name: null }) }),
      );
    });

    it('should trim the name', async () => {
      mockPrismaService.endUser.create.mockResolvedValue({ id: 'eu-1' });

      await service.createFromPhoneNumber(organizationId, '+5215512345678', '  John Doe  ');

      expect(mockPrismaService.endUser.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ name: 'John Doe' }) }),
      );
    });

    // El número ya llega normalizado por `CreateEndUserDto`: el servicio lo guarda tal cual,
    // sin volver a tocarlo.
    it('should store the phone number exactly as received', async () => {
      mockPrismaService.endUser.create.mockResolvedValue({ id: 'eu-1' });

      await service.createFromPhoneNumber(organizationId, '+5215512345678');

      expect(mockPrismaService.endUser.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ phoneNumber: '+5215512345678' }),
        }),
      );
    });

    it('should refuse a duplicate phone number within the organization', async () => {
      mockPrismaService.endUser.create.mockRejectedValue(uniqueConstraintError());

      await expect(
        service.createFromPhoneNumber(organizationId, '+5215512345678'),
      ).rejects.toThrow(ConflictException);
    });

    it('should propagate errors that are not a unique constraint violation', async () => {
      const dbError = new Error('Database connection lost');
      mockPrismaService.endUser.create.mockRejectedValue(dbError);

      await expect(
        service.createFromPhoneNumber(organizationId, '+5215512345678'),
      ).rejects.toThrow('Database connection lost');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // update
  // ═══════════════════════════════════════════════════════════════
  describe('update', () => {
    const organizationId = 'org-123';
    const endUserId = 'eu-1';

    it('should rename the contact', async () => {
      mockPrismaService.endUser.findFirst.mockResolvedValue({ id: endUserId });
      mockPrismaService.endUser.update.mockResolvedValue({ id: endUserId, name: 'Jane Doe' });

      const result = await service.update(organizationId, endUserId, 'Jane Doe');

      expect(mockPrismaService.endUser.update).toHaveBeenCalledWith({
        where: { id: endUserId },
        data: { name: 'Jane Doe' },
        select: expect.any(Object),
      });
      expect(result.name).toBe('Jane Doe');
    });

    it('should trim the name', async () => {
      mockPrismaService.endUser.findFirst.mockResolvedValue({ id: endUserId });
      mockPrismaService.endUser.update.mockResolvedValue({ id: endUserId });

      await service.update(organizationId, endUserId, '  Jane Doe  ');

      expect(mockPrismaService.endUser.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { name: 'Jane Doe' } }),
      );
    });

    it('should refuse to rename a contact from another organization', async () => {
      mockPrismaService.endUser.findFirst.mockResolvedValue(null);

      await expect(service.update('otra-org', endUserId, 'Jane Doe')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrismaService.endUser.update).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // remove
  // ═══════════════════════════════════════════════════════════════
  describe('remove', () => {
    const organizationId = 'org-123';
    const endUserId = 'eu-1';

    it('should delete the contact', async () => {
      mockPrismaService.endUser.findFirst.mockResolvedValue({ id: endUserId });
      mockPrismaService.endUser.delete.mockResolvedValue({ id: endUserId });

      await service.remove(organizationId, endUserId);

      expect(mockPrismaService.endUser.delete).toHaveBeenCalledWith({ where: { id: endUserId } });
    });

    it('should refuse to delete a contact from another organization', async () => {
      mockPrismaService.endUser.findFirst.mockResolvedValue(null);

      await expect(service.remove('otra-org', endUserId)).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.endUser.delete).not.toHaveBeenCalled();
    });
  });
});
