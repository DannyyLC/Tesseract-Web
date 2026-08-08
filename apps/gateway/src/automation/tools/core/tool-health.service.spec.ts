import { Test, TestingModule } from '@nestjs/testing';
import { ToolHealthService } from './tool-health.service';
import { PrismaService } from '@/platform/database/prisma.service';
import { UtilityService } from '@/platform/utility/utility.service';
import { ToolConnectionStatus } from '@tesseract/database';
import { NOTIFICATIONSENUM } from '@tesseract/types';

describe('ToolHealthService', () => {
  let service: ToolHealthService;

  const mockPrisma: any = {
    tenantTool: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const mockUtility = {
    sendNotificationToAppClients: jest.fn(),
  };

  const connectedTool = {
    displayName: 'Calendario Ventas',
    organizationId: 'org-1',
    toolCatalog: { displayName: 'Google Calendar' },
    user: { name: 'Ana Lopez', email: 'ana@acme.com' },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ToolHealthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: UtilityService, useValue: mockUtility },
      ],
    }).compile();

    service = module.get<ToolHealthService>(ToolHealthService);
    jest.clearAllMocks();
  });

  describe('markAuthExpired', () => {
    it('marks the tool and notifies on the transition', async () => {
      mockPrisma.tenantTool.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.tenantTool.findUnique.mockResolvedValue(connectedTool);

      await service.markAuthExpired('tt-1');

      expect(mockPrisma.tenantTool.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ToolConnectionStatus.EXPIRED_AUTH,
            isConnected: false,
          }),
        }),
      );
      expect(mockUtility.sendNotificationToAppClients).toHaveBeenCalledWith(
        'org-1',
        expect.any(Array),
        NOTIFICATIONSENUM.TOOL_AUTH_EXPIRED,
        ['Calendario Ventas', 'Google Calendar', 'Ana Lopez'],
      );
    });

    it('guards the write on the previous status so the update is atomic', async () => {
      mockPrisma.tenantTool.updateMany.mockResolvedValue({ count: 0 });

      await service.markAuthExpired('tt-1');

      expect(mockPrisma.tenantTool.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { not: ToolConnectionStatus.EXPIRED_AUTH },
          }),
        }),
      );
    });

    it('does not notify again while the tool stays broken', async () => {
      // count === 0 => el WHERE no encontró nada que cambiar: ya estaba marcada.
      mockPrisma.tenantTool.updateMany.mockResolvedValue({ count: 0 });

      await service.markAuthExpired('tt-1');

      expect(mockUtility.sendNotificationToAppClients).not.toHaveBeenCalled();
    });

    it('still marks the tool when the notification fails', async () => {
      mockPrisma.tenantTool.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.tenantTool.findUnique.mockRejectedValue(new Error('db down'));

      await expect(service.markAuthExpired('tt-1')).resolves.toBeUndefined();
      expect(mockPrisma.tenantTool.updateMany).toHaveBeenCalled();
    });

    it('names the user by email when they have no display name', async () => {
      mockPrisma.tenantTool.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.tenantTool.findUnique.mockResolvedValue({
        ...connectedTool,
        user: { name: null, email: 'ana@acme.com' },
      });

      await service.markAuthExpired('tt-1');

      expect(mockUtility.sendNotificationToAppClients).toHaveBeenCalledWith(
        'org-1',
        expect.any(Array),
        NOTIFICATIONSENUM.TOOL_AUTH_EXPIRED,
        expect.arrayContaining(['ana@acme.com']),
      );
    });
  });

  describe('markScopesIncomplete', () => {
    it('only downgrades a tool that is currently connected', async () => {
      mockPrisma.tenantTool.updateMany.mockResolvedValue({ count: 1 });

      await service.markScopesIncomplete('tt-1', {
        missingScopes: ['calendar.events'],
        blockedFunctions: ['Crear Evento'],
      });

      // No debe pisar EXPIRED_AUTH: quedarse sin token es más grave.
      expect(mockPrisma.tenantTool.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: ToolConnectionStatus.CONNECTED }),
          data: expect.objectContaining({ status: ToolConnectionStatus.ERROR }),
        }),
      );
    });
  });

  describe('markHealthy', () => {
    it('recovers a tool that had lost access', async () => {
      mockPrisma.tenantTool.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.tenantTool.findUnique.mockResolvedValue(null);

      await service.markHealthy('tt-1');

      expect(mockPrisma.tenantTool.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: ToolConnectionStatus.EXPIRED_AUTH }),
          data: expect.objectContaining({
            status: ToolConnectionStatus.CONNECTED,
            isConnected: true,
            connectionError: null,
          }),
        }),
      );
    });

    it('does not clear a missing-scopes state', async () => {
      // Un refresh exitoso no otorga scopes nuevos: sacar de ERROR a una tool con
      // permisos faltantes la pintaría de verde mintiendo.
      mockPrisma.tenantTool.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.tenantTool.findUnique.mockResolvedValue(null);

      await service.markHealthy('tt-1');

      const { where } = mockPrisma.tenantTool.updateMany.mock.calls[0][0];
      expect(where.status).toBe(ToolConnectionStatus.EXPIRED_AUTH);
    });

    it('re-flags scopes that the auth failure was masking', async () => {
      mockPrisma.tenantTool.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.tenantTool.findUnique.mockResolvedValue({
        allowedFunctions: ['create_event'],
        credential: { scopes: ['calendar.readonly'] },
        toolCatalog: {
          functions: [
            {
              functionName: 'create_event',
              displayName: 'Crear Evento',
              oauthScopes: ['calendar.events'],
            },
          ],
        },
      });

      await service.markHealthy('tt-1');

      // Una vez para recuperar, otra para marcar ERROR por scopes.
      expect(mockPrisma.tenantTool.updateMany).toHaveBeenCalledTimes(2);
      expect(mockPrisma.tenantTool.updateMany.mock.calls[1][0].data.status).toBe(
        ToolConnectionStatus.ERROR,
      );
    });
  });

  describe('findScopeGap', () => {
    const catalog = {
      functions: [
        {
          functionName: 'create_event',
          displayName: 'Crear Evento',
          oauthScopes: ['calendar.events'],
        },
        {
          functionName: 'list_events',
          displayName: 'Listar Eventos',
          oauthScopes: ['calendar.readonly'],
        },
      ],
    };

    it('reports nothing when every enabled function has its scope', () => {
      const gap = service.findScopeGap({
        allowedFunctions: ['create_event', 'list_events'],
        toolCatalog: catalog,
        credential: { scopes: ['calendar.events', 'calendar.readonly'] },
      });

      expect(gap).toEqual({ missingScopes: [], blockedFunctions: [] });
    });

    it('names the functions blocked by a scope the user did not grant', () => {
      const gap = service.findScopeGap({
        allowedFunctions: ['create_event', 'list_events'],
        toolCatalog: catalog,
        credential: { scopes: ['calendar.readonly'] },
      });

      expect(gap.blockedFunctions).toEqual(['Crear Evento']);
      expect(gap.missingScopes).toEqual(['calendar.events']);
    });

    it('ignores functions the org never enabled', () => {
      const gap = service.findScopeGap({
        allowedFunctions: ['list_events'],
        toolCatalog: catalog,
        credential: { scopes: ['calendar.readonly'] },
      });

      expect(gap.blockedFunctions).toEqual([]);
    });

    it('checks every catalog function when allowedFunctions is absent', () => {
      const gap = service.findScopeGap({
        toolCatalog: catalog,
        credential: { scopes: ['calendar.readonly'] },
      });

      expect(gap.blockedFunctions).toEqual(['Crear Evento']);
    });

    it('stays silent when no scopes were recorded', () => {
      // Credenciales cargadas a mano (upsert sin `scopes`) no se pueden evaluar:
      // reportarlas como rotas sería un falso positivo permanente.
      const gap = service.findScopeGap({
        allowedFunctions: ['create_event'],
        toolCatalog: catalog,
        credential: { scopes: [] },
      });

      expect(gap.blockedFunctions).toEqual([]);
    });

    it('does not repeat a scope shared by several blocked functions', () => {
      const gap = service.findScopeGap({
        toolCatalog: {
          functions: [
            { functionName: 'a', oauthScopes: ['s1'] },
            { functionName: 'b', oauthScopes: ['s1'] },
          ],
        },
        credential: { scopes: ['other'] },
      });

      expect(gap.missingScopes).toEqual(['s1']);
      expect(gap.blockedFunctions).toEqual(['a', 'b']);
    });
  });

  describe('syncScopeHealth', () => {
    it('marks ERROR when the granted scopes fall short', async () => {
      mockPrisma.tenantTool.findUnique.mockResolvedValue({
        allowedFunctions: ['create_event'],
        credential: { scopes: ['calendar.readonly'] },
        toolCatalog: {
          functions: [
            {
              functionName: 'create_event',
              displayName: 'Crear Evento',
              oauthScopes: ['calendar.events'],
            },
          ],
        },
      });
      mockPrisma.tenantTool.updateMany.mockResolvedValue({ count: 1 });

      const gap = await service.syncScopeHealth('tt-1');

      expect(gap.blockedFunctions).toEqual(['Crear Evento']);
      expect(mockPrisma.tenantTool.updateMany).toHaveBeenCalled();
    });

    it('leaves a fully authorized tool alone', async () => {
      mockPrisma.tenantTool.findUnique.mockResolvedValue({
        allowedFunctions: ['create_event'],
        credential: { scopes: ['calendar.events'] },
        toolCatalog: {
          functions: [{ functionName: 'create_event', oauthScopes: ['calendar.events'] }],
        },
      });

      await service.syncScopeHealth('tt-1');

      expect(mockPrisma.tenantTool.updateMany).not.toHaveBeenCalled();
    });
  });
});
