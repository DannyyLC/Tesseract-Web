import { TenantToolService } from './tenant-tool.service';
import { ADMIN_PAGE_SIZE } from '@tesseract/types';
import { CursorPaginatedResponseUtils } from '../../../platform/common/responses/cursor-paginated-response';
import { NotFoundException, ConflictException } from '@nestjs/common';

describe('TenantToolService', () => {
  let service: TenantToolService;

  const mockBuild = jest.fn();
  jest
    .spyOn(CursorPaginatedResponseUtils, 'getInstance')
    .mockReturnValue({ build: mockBuild });

  const mockPrismaService: any = {
    tenantTool: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    toolCatalog: { findUnique: jest.fn(), findFirst: jest.fn() },
    whatsAppConfig: { count: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
    workflow: { findMany: jest.fn() },
    tenantToolCredential: { deleteMany: jest.fn() },
    $transaction: jest.fn(),
  };

  const mockLogger = { error: jest.fn() } as any;

  const mockToolHealthService = {
    findScopeGap: jest.fn().mockReturnValue({ missingScopes: [], blockedFunctions: [] }),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Implement $transaction to call the provided callback with a tx object
    mockPrismaService.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        tenantToolCredential: { deleteMany: jest.fn().mockResolvedValue({}) },
        tenantTool: { update: jest.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });

    mockToolHealthService.findScopeGap.mockReturnValue({
      missingScopes: [],
      blockedFunctions: [],
    });

    service = new TenantToolService(mockPrismaService, mockLogger, mockToolHealthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAllForAdmin', () => {
    it('lista paginado sin filtro de organización', async () => {
      const tools = [{ id: 't1' }];
      mockPrismaService.tenantTool.findMany.mockResolvedValue(tools);
      mockPrismaService.tenantTool.count.mockResolvedValue(1);

      const res = await service.findAllForAdmin({});

      expect(mockPrismaService.tenantTool.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deletedAt: null } }),
      );
      // Sin `limit` explícito cae en el tamaño de página de los listados admin.
      expect(res).toEqual({
        data: tools,
        meta: { total: 1, page: 1, limit: ADMIN_PAGE_SIZE, totalPages: 1 },
      });
    });

    it('filtra por organización', async () => {
      mockPrismaService.tenantTool.findMany.mockResolvedValue([]);
      mockPrismaService.tenantTool.count.mockResolvedValue(0);

      await service.findAllForAdmin({ organizationId: 'org-1' });

      expect(mockPrismaService.tenantTool.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deletedAt: null, organizationId: 'org-1' } }),
      );
    });

    it('busca por nombre o id', async () => {
      mockPrismaService.tenantTool.findMany.mockResolvedValue([]);
      mockPrismaService.tenantTool.count.mockResolvedValue(0);

      await service.findAllForAdmin({ search: 'abc-123' });

      expect(mockPrismaService.tenantTool.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            deletedAt: null,
            OR: [
              { displayName: { contains: 'abc-123', mode: 'insensitive' } },
              { id: { contains: 'abc-123', mode: 'insensitive' } },
            ],
          },
        }),
      );
    });
  });

  describe('getDashboardData', () => {
    it('returns paginated results when tenant tools found', async () => {
      const tools = [{ id: 't1' }];
      mockPrismaService.tenantTool.findMany.mockResolvedValue(tools);
      mockBuild.mockResolvedValue({ items: tools, nextCursor: null });

      const res = await service.getDashboardData('org-1', null, 10, 'next');

      expect(mockPrismaService.tenantTool.findMany).toHaveBeenCalled();
      expect(CursorPaginatedResponseUtils.getInstance().build).toHaveBeenCalled();
      expect(res).toEqual({ items: tools, nextCursor: null });
    });

    it('returns null and logs when prisma throws', async () => {
      mockPrismaService.tenantTool.findMany.mockRejectedValue(new Error('db error'));
      const res = await service.getDashboardData('org-1');
      expect(mockLogger.error).toHaveBeenCalled();
      expect(res).toBeNull();
    });
  });

  describe('getTenantToolById', () => {
    it('returns tenant tool when found', async () => {
      const tool = {
        id: 'tt-1',
        displayName: 'Calendario Ventas',
        credential: { scopes: ['calendar.events'] },
        toolCatalog: {
          toolName: 'google_calendar',
          displayName: 'Google Calendar',
          functions: [{ functionName: 'create_event', oauthScopes: ['calendar.events'] }],
        },
      };
      mockPrismaService.tenantTool.findUnique.mockResolvedValue(tool);
      const res = await service.getTenantToolById('tt-1');
      expect(mockPrismaService.tenantTool.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'tt-1' } }),
      );
      // Ni las credenciales ni los scopes del catálogo deben salir al front.
      expect(res).toEqual({
        id: 'tt-1',
        displayName: 'Calendario Ventas',
        toolCatalog: { toolName: 'google_calendar', displayName: 'Google Calendar' },
        blockedFunctions: [],
      });
    });

    it('logs and returns null when prisma throws', async () => {
      mockPrismaService.tenantTool.findUnique.mockRejectedValue(new Error('boom'));
      const res = await service.getTenantToolById('tt-2');
      expect(mockLogger.error).toHaveBeenCalled();
      expect(res).toBeNull();
    });
  });

  describe('createTenantTool', () => {
    it('throws NotFoundException when tool catalog missing', async () => {
      mockPrismaService.toolCatalog.findUnique.mockResolvedValue(null);
      await expect(
        service.createTenantTool(
          {
            displayName: 'X',
            toolCatalogId: 'c1',
            allowedFunctions: [],
            config: {},
            workflowId: null,
          } as any,
          'org-1',
          'user-1',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ConflictException when active tool with same name exists', async () => {
      mockPrismaService.toolCatalog.findUnique.mockResolvedValue({ provider: 'custom' });
      mockPrismaService.tenantTool.findFirst.mockResolvedValue({ id: 'exists' });
      await expect(
        service.createTenantTool(
          {
            displayName: 'Same',
            toolCatalogId: 'c1',
            allowedFunctions: [],
            config: {},
            workflowId: null,
          } as any,
          'org-1',
          'user-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates tool as connected when provider requires no auth', async () => {
      mockPrismaService.toolCatalog.findUnique.mockResolvedValue({ provider: 'none' });
      mockPrismaService.tenantTool.findFirst.mockResolvedValue(null);
      const created = { id: 'new' };
      mockPrismaService.tenantTool.create.mockResolvedValue(created);

      const res = await service.createTenantTool(
        {
          displayName: 'New Tool',
          toolCatalogId: 'c1',
          allowedFunctions: [],
          config: {},
          workflowId: null,
        },
        'org-1',
        'user-1',
      );

      expect(mockPrismaService.tenantTool.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            displayName: 'New Tool',
            organizationId: 'org-1',
            isConnected: true,
          }),
        }),
      );
      expect(res).toEqual(created);
    });

    it('re-throws ConflictException for P2002', async () => {
      mockPrismaService.toolCatalog.findUnique.mockResolvedValue({ provider: 'none' });
      mockPrismaService.tenantTool.findFirst.mockResolvedValue(null);
      const err: any = new Error('unique');
      err.code = 'P2002';
      mockPrismaService.tenantTool.create.mockRejectedValue(err);

      await expect(
        service.createTenantTool(
          {
            displayName: 'New Tool',
            toolCatalogId: 'c1',
            allowedFunctions: [],
            config: {},
            workflowId: null,
          } as any,
          'org-1',
          'user-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('updateTenantTool', () => {
    it('returns updated tool on success', async () => {
      const updated = { id: 'u1', displayName: 'U' };
      mockPrismaService.tenantTool.findFirst.mockResolvedValue({
        id: 'u1',
        organizationId: 'org-1',
      });
      mockPrismaService.tenantTool.update.mockResolvedValue(updated);
      const res = await service.updateTenantTool('u1', 'org-1', 'user-1', 'owner', {
        displayName: 'U',
      });
      expect(res).toEqual(updated);
    });

    it('returns null and logs on error', async () => {
      mockPrismaService.tenantTool.findFirst.mockResolvedValue({
        id: 'u1',
        organizationId: 'org-1',
      });
      mockPrismaService.tenantTool.update.mockRejectedValue(new Error('bomb'));
      const res = await service.updateTenantTool('u1', 'org-1', 'user-1', 'owner', {
        displayName: 'U',
      });
      expect(mockLogger.error).toHaveBeenCalled();
      expect(res).toBeNull();
    });
  });

  describe('add/remove workflows', () => {
    it('adds workflows', async () => {
      const updated = { id: 't1' };
      mockPrismaService.tenantTool.findFirst.mockResolvedValue({
        id: 't1',
        organizationId: 'org-1',
      });
      mockPrismaService.tenantTool.update.mockResolvedValue(updated);
      const res = await service.addWorkflowToTenantTool('t1', 'org-1', 'user-1', 'owner', ['w1']);
      expect(mockPrismaService.tenantTool.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 't1' } }),
      );
      expect(res).toEqual(updated);
    });

    it('removes workflows', async () => {
      const updated = { id: 't1' };
      mockPrismaService.tenantTool.findFirst.mockResolvedValue({
        id: 't1',
        organizationId: 'org-1',
      });
      mockPrismaService.tenantTool.update.mockResolvedValue(updated);
      const res = await service.removeWorkflowFromTenantTool('t1', 'org-1', 'user-1', 'owner', [
        'w1',
      ]);
      expect(mockPrismaService.tenantTool.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 't1' } }),
      );
      expect(res).toEqual(updated);
    });
  });

  describe('deleteTool', () => {
    it('throws NotFoundException if tool not found', async () => {
      mockPrismaService.tenantTool.findFirst.mockResolvedValue(null);
      await expect(service.deleteTool('t1', 'org-1', 'user-1', 'owner')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws when user not owner and did not create', async () => {
      mockPrismaService.tenantTool.findFirst.mockResolvedValue({
        id: 't1',
        createdByUserId: 'someone',
      });
      await expect(service.deleteTool('t1', 'org-1', 'user-1', 'member')).rejects.toThrow();
    });

    it('calls transaction when deletion allowed', async () => {
      mockPrismaService.tenantTool.findFirst.mockResolvedValue({
        id: 't1',
        createdByUserId: 'user-1',
      });
      await service.deleteTool('t1', 'org-1', 'user-1', 'member');
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
    });
  });

  describe('disconnectTool', () => {
    it('throws NotFoundException if tool not found', async () => {
      mockPrismaService.tenantTool.findFirst.mockResolvedValue(null);
      await expect(service.disconnectTool('t1', 'org-1', 'user-1', 'owner')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws when user not owner and did not create', async () => {
      mockPrismaService.tenantTool.findFirst.mockResolvedValue({
        id: 't1',
        createdByUserId: 'someone',
      });
      await expect(service.disconnectTool('t1', 'org-1', 'user-1', 'member')).rejects.toThrow();
    });

    it('calls transaction and updates config to null-like value', async () => {
      mockPrismaService.tenantTool.findFirst.mockResolvedValue({
        id: 't1',
        createdByUserId: 'user-1',
      });
      await service.disconnectTool('t1', 'org-1', 'user-1', 'member');
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
    });
  });

  describe('getWhatsappOutboundStatus', () => {
    it('hasWhatsappConfig en false y sin workflows pendientes cuando la org no tiene números', async () => {
      mockPrismaService.whatsAppConfig.count.mockResolvedValue(0);
      mockPrismaService.tenantTool.findFirst.mockResolvedValue(null);
      mockPrismaService.whatsAppConfig.findMany.mockResolvedValue([]);

      const res = await service.getWhatsappOutboundStatus('org-1');

      expect(res).toEqual({ hasWhatsappConfig: false, tenantToolId: null, unlinkedWorkflows: [] });
    });

    it('agrupa varios números que apuntan al mismo workflow todavía no enganchado', async () => {
      mockPrismaService.whatsAppConfig.count.mockResolvedValue(2);
      mockPrismaService.tenantTool.findFirst.mockResolvedValue(null);
      mockPrismaService.whatsAppConfig.findMany.mockResolvedValue([
        {
          id: 'c1',
          phoneNumber: '+1',
          displayName: 'Ventas',
          defaultWorkflowId: 'w1',
          defaultWorkflow: { id: 'w1', name: 'Flujo Ventas' },
        },
        {
          id: 'c2',
          phoneNumber: '+2',
          displayName: 'Soporte',
          defaultWorkflowId: 'w1',
          defaultWorkflow: { id: 'w1', name: 'Flujo Ventas' },
        },
      ]);

      const res = await service.getWhatsappOutboundStatus('org-1');

      expect(res.unlinkedWorkflows).toEqual([
        {
          workflowId: 'w1',
          workflowName: 'Flujo Ventas',
          whatsappNumbers: [
            { whatsappConfigId: 'c1', phoneNumber: '+1', displayName: 'Ventas' },
            { whatsappConfigId: 'c2', phoneNumber: '+2', displayName: 'Soporte' },
          ],
        },
      ]);
    });

    it('excluye workflows que ya están enganchados a la tenant tool existente', async () => {
      mockPrismaService.whatsAppConfig.count.mockResolvedValue(1);
      mockPrismaService.tenantTool.findFirst.mockResolvedValue({
        id: 'tt-1',
        workflows: [{ id: 'w1' }],
      });
      mockPrismaService.whatsAppConfig.findMany.mockResolvedValue([
        {
          id: 'c1',
          phoneNumber: '+1',
          displayName: null,
          defaultWorkflowId: 'w1',
          defaultWorkflow: { id: 'w1', name: 'Flujo Ventas' },
        },
      ]);

      const res = await service.getWhatsappOutboundStatus('org-1');

      expect(res.tenantToolId).toBe('tt-1');
      expect(res.unlinkedWorkflows).toEqual([]);
    });
  });

  describe('linkWhatsappOutboundWorkflows', () => {
    it('throws NotFoundException cuando no llegan workflowIds', async () => {
      await expect(service.linkWhatsappOutboundWorkflows('org-1', 'user-1', [])).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws NotFoundException cuando un workflow no pertenece a la organización', async () => {
      mockPrismaService.workflow.findMany.mockResolvedValue([{ id: 'w1' }]);

      await expect(
        service.linkWhatsappOutboundWorkflows('org-1', 'user-1', ['w1', 'w2']),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException cuando no existe el catálogo de send_bulk_whatsapp', async () => {
      mockPrismaService.workflow.findMany.mockResolvedValue([{ id: 'w1' }]);
      mockPrismaService.toolCatalog.findFirst.mockResolvedValue(null);

      await expect(
        service.linkWhatsappOutboundWorkflows('org-1', 'user-1', ['w1']),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('conecta los workflows a la tenant tool existente sin tocar su config', async () => {
      mockPrismaService.workflow.findMany.mockResolvedValue([{ id: 'w1' }]);
      mockPrismaService.toolCatalog.findFirst.mockResolvedValue({ id: 'cat-1', displayName: 'WhatsApp Outbound' });
      mockPrismaService.tenantTool.findFirst.mockResolvedValue({ id: 'tt-1' });
      const updated = { id: 'tt-1' };
      mockPrismaService.tenantTool.update.mockResolvedValue(updated);

      const res = await service.linkWhatsappOutboundWorkflows('org-1', 'user-1', ['w1']);

      expect(mockPrismaService.tenantTool.update).toHaveBeenCalledWith({
        where: { id: 'tt-1' },
        data: { workflows: { connect: [{ id: 'w1' }] } },
      });
      expect(mockPrismaService.tenantTool.create).not.toHaveBeenCalled();
      expect(res).toEqual(updated);
    });

    it('crea la tenant tool con allowedFunctions y config de un solo número', async () => {
      mockPrismaService.workflow.findMany.mockResolvedValue([{ id: 'w1' }]);
      mockPrismaService.toolCatalog.findFirst.mockResolvedValue({ id: 'cat-1', displayName: 'WhatsApp Outbound' });
      mockPrismaService.tenantTool.findFirst.mockResolvedValue(null);
      mockPrismaService.whatsAppConfig.findMany.mockResolvedValue([{ id: 'c1' }]);
      const created = { id: 'tt-new' };
      mockPrismaService.tenantTool.create.mockResolvedValue(created);

      const res = await service.linkWhatsappOutboundWorkflows('org-1', 'user-1', ['w1']);

      expect(mockPrismaService.tenantTool.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            toolCatalogId: 'cat-1',
            allowedFunctions: ['send_bulk_whatsapp'],
            config: { whatsapp_config_id: 'c1' },
            createdByUserId: 'user-1',
            workflows: { connect: [{ id: 'w1' }] },
          }),
        }),
      );
      expect(res).toEqual(created);
    });

    it('crea la tenant tool con config en array cuando hay 2+ números enganchados', async () => {
      mockPrismaService.workflow.findMany.mockResolvedValue([{ id: 'w1' }, { id: 'w2' }]);
      mockPrismaService.toolCatalog.findFirst.mockResolvedValue({ id: 'cat-1', displayName: 'WhatsApp Outbound' });
      mockPrismaService.tenantTool.findFirst.mockResolvedValue(null);
      mockPrismaService.whatsAppConfig.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);
      mockPrismaService.tenantTool.create.mockResolvedValue({ id: 'tt-new' });

      await service.linkWhatsappOutboundWorkflows('org-1', 'user-1', ['w1', 'w2']);

      expect(mockPrismaService.tenantTool.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ config: { whatsapp_config_id: ['c1', 'c2'] } }),
        }),
      );
    });

    it('crea la tenant tool sin config cuando ningún WhatsAppConfig activo apunta a los workflows', async () => {
      mockPrismaService.workflow.findMany.mockResolvedValue([{ id: 'w1' }]);
      mockPrismaService.toolCatalog.findFirst.mockResolvedValue({ id: 'cat-1', displayName: 'WhatsApp Outbound' });
      mockPrismaService.tenantTool.findFirst.mockResolvedValue(null);
      mockPrismaService.whatsAppConfig.findMany.mockResolvedValue([]);
      mockPrismaService.tenantTool.create.mockResolvedValue({ id: 'tt-new' });

      await service.linkWhatsappOutboundWorkflows('org-1', 'user-1', ['w1']);

      expect(mockPrismaService.tenantTool.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ config: undefined }) }),
      );
    });

    it('re-throws ConflictException para P2002 al crear', async () => {
      mockPrismaService.workflow.findMany.mockResolvedValue([{ id: 'w1' }]);
      mockPrismaService.toolCatalog.findFirst.mockResolvedValue({ id: 'cat-1', displayName: 'WhatsApp Outbound' });
      mockPrismaService.tenantTool.findFirst.mockResolvedValue(null);
      mockPrismaService.whatsAppConfig.findMany.mockResolvedValue([]);
      const err: any = new Error('unique');
      err.code = 'P2002';
      mockPrismaService.tenantTool.create.mockRejectedValue(err);

      await expect(
        service.linkWhatsappOutboundWorkflows('org-1', 'user-1', ['w1']),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
