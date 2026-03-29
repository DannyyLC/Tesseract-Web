import { TenantToolService } from './tenant-tool.service';
import { CursorPaginatedResponseUtils } from '../../common/responses/cursor-paginated-response';
import { NotFoundException, ConflictException } from '@nestjs/common';

describe('TenantToolService', () => {
  let service: TenantToolService;

  const mockBuild = jest.fn();
  jest.spyOn(CursorPaginatedResponseUtils, 'getInstance').mockReturnValue({ build: mockBuild } as any);

  const mockPrismaService: any = {
    tenantTool: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    toolCatalog: { findUnique: jest.fn() },
    tenantToolCredential: { deleteMany: jest.fn() },
    $transaction: jest.fn(),
  };

  const mockLogger = { error: jest.fn() } as any;

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

    service = new TenantToolService(mockPrismaService, mockLogger);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
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
      const tool = { id: 'tt-1' };
      mockPrismaService.tenantTool.findUnique.mockResolvedValue(tool);
      const res = await service.getTenantToolById('tt-1');
      expect(mockPrismaService.tenantTool.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'tt-1' } }));
      expect(res).toEqual(tool);
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
      await expect(service.createTenantTool({ displayName: 'X', toolCatalogId: 'c1', allowedFunctions: [], config: {}, workflowId: null } as any, 'org-1', 'user-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ConflictException when active tool with same name exists', async () => {
      mockPrismaService.toolCatalog.findUnique.mockResolvedValue({ provider: 'custom' });
      mockPrismaService.tenantTool.findFirst.mockResolvedValue({ id: 'exists' });
      await expect(service.createTenantTool({ displayName: 'Same', toolCatalogId: 'c1', allowedFunctions: [], config: {}, workflowId: null } as any, 'org-1', 'user-1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates tool as connected when provider requires no auth', async () => {
      mockPrismaService.toolCatalog.findUnique.mockResolvedValue({ provider: 'none' });
      mockPrismaService.tenantTool.findFirst.mockResolvedValue(null);
      const created = { id: 'new' };
      mockPrismaService.tenantTool.create.mockResolvedValue(created);

      const res = await service.createTenantTool({ displayName: 'New Tool', toolCatalogId: 'c1', allowedFunctions: [], config: {}, workflowId: null } as any, 'org-1', 'user-1');

      expect(mockPrismaService.tenantTool.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          displayName: 'New Tool',
          organizationId: 'org-1',
          isConnected: true,
        }),
      }));
      expect(res).toEqual(created);
    });

    it('re-throws ConflictException for P2002', async () => {
      mockPrismaService.toolCatalog.findUnique.mockResolvedValue({ provider: 'none' });
      mockPrismaService.tenantTool.findFirst.mockResolvedValue(null);
      const err: any = new Error('unique');
      err.code = 'P2002';
      mockPrismaService.tenantTool.create.mockRejectedValue(err);

      await expect(service.createTenantTool({ displayName: 'New Tool', toolCatalogId: 'c1', allowedFunctions: [], config: {}, workflowId: null } as any, 'org-1', 'user-1')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('updateTenantTool', () => {
    it('returns updated tool on success', async () => {
      const updated = { id: 'u1', displayName: 'U' };
      mockPrismaService.tenantTool.update.mockResolvedValue(updated);
      const res = await service.updateTenantTool('u1', { displayName: 'U' } as any);
      expect(res).toEqual(updated);
    });

    it('returns null and logs on error', async () => {
      mockPrismaService.tenantTool.update.mockRejectedValue(new Error('bomb'));
      const res = await service.updateTenantTool('u1', { displayName: 'U' } as any);
      expect(mockLogger.error).toHaveBeenCalled();
      expect(res).toBeNull();
    });
  });

  describe('add/remove workflows', () => {
    it('adds workflows', async () => {
      const updated = { id: 't1' };
      mockPrismaService.tenantTool.update.mockResolvedValue(updated);
      const res = await service.addWorkflowToTenantTool('t1', ['w1']);
      expect(mockPrismaService.tenantTool.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 't1' } }));
      expect(res).toEqual(updated);
    });

    it('removes workflows', async () => {
      const updated = { id: 't1' };
      mockPrismaService.tenantTool.update.mockResolvedValue(updated);
      const res = await service.removeWorkflowFromTenantTool('t1', ['w1']);
      expect(mockPrismaService.tenantTool.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 't1' } }));
      expect(res).toEqual(updated);
    });
  });

  describe('deleteTool', () => {
    it('throws NotFoundException if tool not found', async () => {
      mockPrismaService.tenantTool.findFirst.mockResolvedValue(null);
      await expect(service.deleteTool('t1', 'org-1', 'user-1', 'owner')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws when user not owner and did not create', async () => {
      mockPrismaService.tenantTool.findFirst.mockResolvedValue({ id: 't1', createdByUserId: 'someone' });
      await expect(service.deleteTool('t1', 'org-1', 'user-1', 'member')).rejects.toThrow();
    });

    it('calls transaction when deletion allowed', async () => {
      mockPrismaService.tenantTool.findFirst.mockResolvedValue({ id: 't1', createdByUserId: 'user-1' });
      await service.deleteTool('t1', 'org-1', 'user-1', 'member');
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
    });
  });

  describe('disconnectTool', () => {
    it('throws NotFoundException if tool not found', async () => {
      mockPrismaService.tenantTool.findFirst.mockResolvedValue(null);
      await expect(service.disconnectTool('t1', 'org-1', 'user-1', 'owner')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws when user not owner and did not create', async () => {
      mockPrismaService.tenantTool.findFirst.mockResolvedValue({ id: 't1', createdByUserId: 'someone' });
      await expect(service.disconnectTool('t1', 'org-1', 'user-1', 'member')).rejects.toThrow();
    });

    it('calls transaction and updates config to null-like value', async () => {
      mockPrismaService.tenantTool.findFirst.mockResolvedValue({ id: 't1', createdByUserId: 'user-1' });
      await service.disconnectTool('t1', 'org-1', 'user-1', 'member');
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
    });
  });
});
