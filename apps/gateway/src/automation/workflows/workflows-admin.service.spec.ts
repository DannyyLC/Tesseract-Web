import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, WorkflowVersionSource } from '@tesseract/database';
import { WorkflowsAdminService } from './workflows-admin.service';
import { WorkflowConfigValidator } from './workflow-config.validator';
import { PrismaService } from '@/platform/database/prisma.service';
import { OrganizationsService } from '@/identity/organizations/organizations.service';
import { AgentsService } from '../agents/agents.service';
import { InvalidWorkflowConfigException } from '@/platform/common/exceptions';
import { hashConfig } from './workflow-config.utils';
import { AdminAnalyticsService } from '@/billing/analytics/analytics.service';

/**
 * Config válido mínimo: incluye una clave que ningún formulario del editor conoce,
 * para comprobar que el guardado la conserva.
 */
const validConfig = (promptSuffix = '') => ({
  type: 'agent',
  post_turn_actions: [{ id: 'share', action: 'send_drive_folder_media' }],
  graph: {
    type: 'pipeline',
    nodes: [{ id: 'agente', type: 'agent', agent: 'general' }],
    edges: [
      { from: 'START', to: 'agente' },
      { from: 'agente', to: 'END' },
    ],
  },
  agents: { general: { model: 'gpt-4o', system_prompt: `Eres un asesor.${promptSuffix}` } },
});

const ACTOR = { id: 'user-1', email: 'persona@ejemplo.com' };

describe('WorkflowsAdminService', () => {
  let service: WorkflowsAdminService;
  let prisma: any;
  let tx: any;

  beforeEach(async () => {
    tx = {
      workflowConfigVersion: {
        count: jest.fn().mockResolvedValue(0),
        create: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ id: 'v-new', ...data })),
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      workflow: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({ id: 'wf-1', name: 'WF', version: 9 }),
      },
    };

    prisma = {
      workflow: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      workflowConfigVersion: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
      llmModel: { findMany: jest.fn().mockResolvedValue([{ modelName: 'gpt-4o' }]) },
      organization: { findUnique: jest.fn() },
      $transaction: jest.fn().mockImplementation((cb: any) => cb(tx)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowsAdminService,
        WorkflowConfigValidator,
        { provide: PrismaService, useValue: prisma },
        {
          provide: OrganizationsService,
          useValue: { canAddWorkflow: jest.fn().mockResolvedValue(true) },
        },
        // Sin motor disponible: la validación de catálogo se omite, como en producción
        // cuando el servicio de agentes está caído.
        {
          provide: AgentsService,
          useValue: { getNodeCatalog: jest.fn().mockRejectedValue(new Error('down')) },
        },
        { provide: ConfigService, useValue: { get: (_k: string, d: unknown) => d } },
        { provide: AdminAnalyticsService, useValue: { resolveWorkflowSegment: jest.fn() } },
      ],
    }).compile();

    service = module.get(WorkflowsAdminService);
  });

  describe('getEditorContext', () => {
    it('una sola fila por modelo (la vigente) y con sus capacidades', async () => {
      // findMany llega por provider, modelName y effectiveFrom desc: la vigente primero.
      prisma.llmModel.findMany.mockResolvedValue([
        {
          id: 'sonnet',
          modelName: 'claude-sonnet-5-5',
          provider: 'anthropic',
          tier: 'STANDARD',
          effectiveTo: null,
          supportsTemperature: false,
          allowedParams: {},
        },
        {
          id: 'luna-nuevo',
          modelName: 'gpt-6-luna',
          provider: 'openai',
          tier: 'BASIC',
          effectiveTo: null,
          supportsTemperature: true,
          allowedParams: { reasoning_effort: ['none', 'low'] },
        },
        {
          id: 'luna-viejo',
          modelName: 'gpt-6-luna',
          provider: 'openai',
          tier: 'BASIC',
          effectiveTo: new Date('2026-01-01'),
          supportsTemperature: true,
          allowedParams: {},
        },
      ]);

      const { models } = await service.getEditorContext();

      expect(models).toEqual([
        {
          id: 'sonnet',
          modelName: 'claude-sonnet-5-5',
          provider: 'anthropic',
          tier: 'STANDARD',
          supportsTemperature: false,
          allowedParams: {},
        },
        {
          id: 'luna-nuevo',
          modelName: 'gpt-6-luna',
          provider: 'openai',
          tier: 'BASIC',
          supportsTemperature: true,
          allowedParams: { reasoning_effort: ['none', 'low'] },
        },
      ]);
    });
  });

  describe('updateConfig', () => {
    const current = (version = 9, config = validConfig()) => ({
      id: 'wf-1',
      version,
      config,
      name: 'WF',
      organizationId: 'org-1',
    });

    it('404 si el workflow no existe', async () => {
      prisma.workflow.findUnique.mockResolvedValue(null);
      await expect(service.updateConfig('wf-x', validConfig(), 1, ACTOR)).rejects.toThrow(
        NotFoundException,
      );
    });

    // El corazón del bloqueo optimista: si alguien guardó primero, no se pisa.
    it('409 si la versión esperada no coincide', async () => {
      prisma.workflow.findUnique.mockResolvedValue(current(10));
      await expect(service.updateConfig('wf-1', validConfig(' x'), 9, ACTOR)).rejects.toThrow(
        ConflictException,
      );
      expect(tx.workflow.updateMany).not.toHaveBeenCalled();
    });

    // Una edición por SQL directo cambia el config sin mover `version`; el hash es lo
    // único que la detecta.
    it('409 si el config cambió por fuera aunque la versión coincida', async () => {
      prisma.workflow.findUnique.mockResolvedValue(current(9, validConfig(' editado por SQL')));

      await expect(
        service.updateConfig('wf-1', validConfig(' desde la UI'), 9, ACTOR, {
          expectedHash: hashConfig(validConfig()),
        }),
      ).rejects.toThrow(ConflictException);
      expect(tx.workflow.updateMany).not.toHaveBeenCalled();
    });

    it('deja pasar cuando el hash esperado sí coincide', async () => {
      const config = validConfig();
      prisma.workflow.findUnique.mockResolvedValue(current(9, config));

      const result = await service.updateConfig('wf-1', validConfig(' nuevo'), 9, ACTOR, {
        expectedHash: hashConfig(config),
      });

      expect(result.changed).toBe(true);
    });

    it('no escribe nada si el config es equivalente (dedupe)', async () => {
      prisma.workflow.findUnique.mockResolvedValue(current());

      const result = await service.updateConfig('wf-1', validConfig(), 9, ACTOR);

      expect(result.changed).toBe(false);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('ignora el reordenamiento de claves al comparar', async () => {
      prisma.workflow.findUnique.mockResolvedValue(current());
      const reordered = {
        agents: validConfig().agents,
        graph: validConfig().graph,
        type: 'agent',
        post_turn_actions: validConfig().post_turn_actions,
      };

      const result = await service.updateConfig('wf-1', reordered, 9, ACTOR);

      expect(result.changed).toBe(false);
    });

    it('422 con TODOS los errores acumulados, sin escribir', async () => {
      prisma.workflow.findUnique.mockResolvedValue(current());
      const broken = {
        type: 'agent',
        graph: {
          type: 'pipeline',
          nodes: [
            { id: 'a', type: 'agent' },
            { id: 'a', type: 'agent' },
          ],
          edges: [{ from: 'START', to: 'fantasma' }],
        },
        agents: { x: { model: 'modelo-inexistente' } },
      };

      await expect(service.updateConfig('wf-1', broken, 9, ACTOR)).rejects.toThrow(
        InvalidWorkflowConfigException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    // Sin esto, la primera edición desde la UI borraría para siempre lo que había
    // antes — justo lo que el historial existe para evitar.
    it('crea un BASELINE con el estado previo la primera vez', async () => {
      const previo = validConfig();
      prisma.workflow.findUnique.mockResolvedValue(current(9, previo));
      tx.workflowConfigVersion.count.mockResolvedValue(0);

      await service.updateConfig('wf-1', validConfig(' cambiado'), 9, ACTOR);

      const [baselineCall, nuevaCall] = tx.workflowConfigVersion.create.mock.calls;
      expect(baselineCall[0].data).toMatchObject({
        version: 9,
        isBaseline: true,
        source: WorkflowVersionSource.BASELINE,
      });
      expect(baselineCall[0].data.config).toEqual(previo);
      expect(nuevaCall[0].data).toMatchObject({
        version: 10,
        source: WorkflowVersionSource.ADMIN_UI,
      });
    });

    it('no repite el baseline si ya hay historial', async () => {
      prisma.workflow.findUnique.mockResolvedValue(current());
      tx.workflowConfigVersion.count.mockResolvedValue(3);

      await service.updateConfig('wf-1', validConfig(' otro'), 9, ACTOR);

      const baselines = tx.workflowConfigVersion.create.mock.calls.filter(
        (c: any) => c[0].data.isBaseline,
      );
      expect(baselines).toHaveLength(0);
    });

    // La versión esperada va en el WHERE: es un compare-and-swap real, sin ventana
    // entre leer y escribir.
    it('pone la versión esperada en el WHERE del UPDATE', async () => {
      prisma.workflow.findUnique.mockResolvedValue(current());

      await service.updateConfig('wf-1', validConfig(' cas'), 9, ACTOR);

      expect(tx.workflow.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'wf-1', version: 9 } }),
      );
    });

    it('409 si el compare-and-swap no afecta ninguna fila', async () => {
      prisma.workflow.findUnique.mockResolvedValue(current());
      tx.workflow.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.updateConfig('wf-1', validConfig(' race'), 9, ACTOR)).rejects.toThrow(
        ConflictException,
      );
    });

    it('guarda el config completo, incluidas las claves que ningún formulario toca', async () => {
      prisma.workflow.findUnique.mockResolvedValue(current());
      const nuevo = validConfig(' con nota');

      await service.updateConfig('wf-1', nuevo, 9, ACTOR);

      expect(tx.workflow.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ config: nuevo }) }),
      );
      expect(nuevo.post_turn_actions).toBeDefined();
    });

    it('registra quién hizo el cambio y la nota', async () => {
      prisma.workflow.findUnique.mockResolvedValue(current());

      await service.updateConfig('wf-1', validConfig(' n'), 9, ACTOR, { note: 'tono formal' });

      const nueva = tx.workflowConfigVersion.create.mock.calls.at(-1)[0].data;
      expect(nueva).toMatchObject({
        note: 'tono formal',
        createdById: 'user-1',
        createdByEmail: 'persona@ejemplo.com',
      });
    });

    it('poda las versiones viejas conservando el baseline', async () => {
      prisma.workflow.findUnique.mockResolvedValue(current());
      tx.workflowConfigVersion.findMany.mockResolvedValue([{ id: 'old-1' }, { id: 'old-2' }]);

      await service.updateConfig('wf-1', validConfig(' poda'), 9, ACTOR);

      expect(tx.workflowConfigVersion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workflowId: 'wf-1', isBaseline: false }, skip: 30 }),
      );
      expect(tx.workflowConfigVersion.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['old-1', 'old-2'] } },
      });
    });
  });

  describe('restoreVersion', () => {
    it('restaura pasando por updateConfig, así hereda validación y bloqueo optimista', async () => {
      const viejo = validConfig(' versión vieja');
      prisma.workflowConfigVersion.findFirst.mockResolvedValue({
        id: 'ver-1',
        version: 5,
        config: viejo,
      });
      prisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-1',
        version: 9,
        config: validConfig(' actual'),
        name: 'WF',
        organizationId: 'org-1',
      });

      const result = await service.restoreVersion('wf-1', 'ver-1', 9, ACTOR);

      expect(result.changed).toBe(true);
      expect(tx.workflow.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ config: viejo }) }),
      );
      const nueva = tx.workflowConfigVersion.create.mock.calls.at(-1)[0].data;
      expect(nueva.source).toBe(WorkflowVersionSource.RESTORE);
      expect(nueva.note).toContain('5');
    });

    it('404 si la versión no existe', async () => {
      prisma.workflowConfigVersion.findFirst.mockResolvedValue(null);
      await expect(service.restoreVersion('wf-1', 'nope', 9, ACTOR)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('persiste isInternal cuando se pide un workflow interno', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', plan: 'BUSINESS' });
      prisma.workflow.create.mockResolvedValue({ id: 'wf-nuevo', isInternal: true, version: 1 });
      prisma.workflowConfigVersion.create = jest.fn().mockResolvedValue({});

      await service.create(
        {
          organizationId: 'org-1',
          name: 'Workflow de prueba',
          category: 'STANDARD',
          maxHistoryTokens: 50000,
          config: validConfig(),
          isInternal: true,
        } as any,
        ACTOR,
      );

      expect(prisma.workflow.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isInternal: true }),
        }),
      );
    });

    it('por defecto crea un workflow no interno (visible para el cliente)', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', plan: 'BUSINESS' });
      prisma.workflow.create.mockResolvedValue({ id: 'wf-nuevo', isInternal: false, version: 1 });
      prisma.workflowConfigVersion.create = jest.fn().mockResolvedValue({});

      await service.create(
        {
          organizationId: 'org-1',
          name: 'Workflow de prueba',
          category: 'STANDARD',
          maxHistoryTokens: 50000,
          config: validConfig(),
        } as any,
        ACTOR,
      );

      expect(prisma.workflow.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isInternal: false }),
        }),
      );
    });
  });

  describe('clone', () => {
    it('lista las tool instances que hay que reasignar en la organización destino', async () => {
      const config = {
        ...validConfig(),
        agents: { general: { model: 'gpt-4o', tools: ['tool-uuid-1'] } },
        graph: {
          type: 'pipeline',
          nodes: [
            { id: 'agente', type: 'agent', agent: 'general' },
            { id: 'notify', type: 'tool', config: { tool_instance: 'tool-uuid-2' } },
          ],
          edges: [
            { from: 'START', to: 'agente' },
            { from: 'agente', to: 'notify' },
            { from: 'notify', to: 'END' },
          ],
        },
      };
      prisma.workflow.findUnique.mockResolvedValue({
        config,
        category: 'STANDARD',
        maxHistoryTokens: 50000,
        description: null,
        organizationId: 'org-origen',
      });
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-destino', plan: 'BUSINESS' });
      prisma.workflow.create.mockResolvedValue({ id: 'wf-nuevo', version: 1, config });
      prisma.workflowConfigVersion.create = jest.fn().mockResolvedValue({});

      const result = await service.clone(
        'wf-1',
        { targetOrganizationId: 'org-destino', name: 'Clon' },
        ACTOR,
      );

      expect(result.toolReferences).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'tool-uuid-1' }),
          expect.objectContaining({ id: 'tool-uuid-2' }),
        ]),
      );
    });
  });

  describe('integraciones del workflow', () => {
    const WF = 'wf-1';
    const ORG = 'org-a';
    const TOOL = 'tool-1';

    const scope = (overrides: Record<string, unknown> = {}) => ({
      id: WF,
      organizationId: ORG,
      deletedAt: null,
      organization: { name: 'Cliente A', deletedAt: null },
      ...overrides,
    });

    const notFoundError = () =>
      new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: 'test',
      });

    beforeEach(() => {
      prisma.workflow.findUnique.mockResolvedValue(scope());
      prisma.workflow.update.mockResolvedValue({ id: WF, config: {} });
      prisma.tenantTool = {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue({ id: TOOL }),
      };
    });

    describe('listIntegrations', () => {
      it('acota siempre a la organización del workflow', async () => {
        await service.listIntegrations(WF, { search: 'hub', filter: 'linked' });

        const { where } = prisma.tenantTool.findMany.mock.calls[0][0];
        expect(where.organizationId).toBe(ORG);
        expect(where.deletedAt).toBeNull();
        expect(where.AND).toEqual(expect.arrayContaining([{ workflows: { some: { id: WF } } }]));
        expect(prisma.tenantTool.count).toHaveBeenCalledWith({ where });
      });

      it('ignora un organizationId colado en el query', async () => {
        await service.listIntegrations(WF, { organizationId: 'org-b' } as never);

        const { where } = prisma.tenantTool.findMany.mock.calls[0][0];
        expect(where.organizationId).toBe(ORG);
        expect(JSON.stringify(where)).not.toContain('org-b');
      });

      it('marca cuáles están vinculadas a este workflow', async () => {
        prisma.tenantTool.findMany.mockResolvedValue([
          { id: 't1', workflows: [{ id: WF }], _count: { workflows: 2 } },
          { id: 't2', workflows: [], _count: { workflows: 0 } },
        ]);
        prisma.tenantTool.count.mockResolvedValue(2);

        const result = await service.listIntegrations(WF, {});

        expect(result.organization).toEqual({ id: ORG, name: 'Cliente A' });
        expect(result.data).toEqual([
          { id: 't1', linked: true, workflowCount: 2 },
          { id: 't2', linked: false, workflowCount: 0 },
        ]);
      });

      it('filtra las no vinculadas', async () => {
        await service.listIntegrations(WF, { filter: 'unlinked' });

        const { where } = prisma.tenantTool.findMany.mock.calls[0][0];
        expect(where.AND).toEqual([{ workflows: { none: { id: WF } } }]);
      });

      it('404 si el workflow no existe', async () => {
        prisma.workflow.findUnique.mockResolvedValue(null);
        await expect(service.listIntegrations(WF, {})).rejects.toThrow(NotFoundException);
      });
    });

    describe('linkIntegration', () => {
      it('vincula repitiendo la organización dentro del connect', async () => {
        const result = await service.linkIntegration(WF, TOOL, ACTOR);

        expect(prisma.tenantTool.findFirst).toHaveBeenCalledWith({
          where: { id: TOOL, organizationId: ORG, deletedAt: null },
          select: { id: true },
        });
        expect(prisma.workflow.update).toHaveBeenCalledWith({
          where: { id: WF, organizationId: ORG, deletedAt: null },
          data: {
            tenantTools: { connect: { id: TOOL, organizationId: ORG, deletedAt: null } },
          },
          select: { id: true },
        });
        expect(result).toEqual({ workflowId: WF, toolId: TOOL, linked: true });
      });

      it('404 y sin escribir si la tool es de otra organización o está borrada', async () => {
        prisma.tenantTool.findFirst.mockResolvedValue(null);

        await expect(service.linkIntegration(WF, TOOL, ACTOR)).rejects.toThrow(
          'Integración no encontrada en la organización del workflow',
        );
        expect(prisma.workflow.update).not.toHaveBeenCalled();
      });

      it('404 si la tool deja de cumplir el filtro entre la verificación y la escritura', async () => {
        prisma.workflow.update.mockRejectedValue(notFoundError());

        await expect(service.linkIntegration(WF, TOOL, ACTOR)).rejects.toThrow(NotFoundException);
      });

      it('no traduce errores que no son de registro inexistente', async () => {
        const boom = new Error('conexión caída');
        prisma.workflow.update.mockRejectedValue(boom);

        await expect(service.linkIntegration(WF, TOOL, ACTOR)).rejects.toBe(boom);
      });

      it('404 si el workflow no existe', async () => {
        prisma.workflow.findUnique.mockResolvedValue(null);
        await expect(service.linkIntegration(WF, TOOL, ACTOR)).rejects.toThrow(
          'Workflow no encontrado',
        );
      });

      it('409 si el workflow está borrado', async () => {
        prisma.workflow.findUnique.mockResolvedValue(scope({ deletedAt: new Date() }));

        await expect(service.linkIntegration(WF, TOOL, ACTOR)).rejects.toThrow(ConflictException);
        expect(prisma.workflow.update).not.toHaveBeenCalled();
      });

      it('409 si la organización está borrada', async () => {
        prisma.workflow.findUnique.mockResolvedValue(
          scope({ organization: { name: 'Cliente A', deletedAt: new Date() } }),
        );

        await expect(service.linkIntegration(WF, TOOL, ACTOR)).rejects.toThrow(ConflictException);
      });
    });

    describe('unlinkIntegration', () => {
      it('desvincula acotando a la organización, aunque la tool esté borrada', async () => {
        await service.unlinkIntegration(WF, TOOL, ACTOR);

        expect(prisma.tenantTool.findFirst).toHaveBeenCalledWith({
          where: { id: TOOL, organizationId: ORG },
          select: { id: true },
        });
        expect(prisma.workflow.update).toHaveBeenCalledWith({
          where: { id: WF, organizationId: ORG },
          data: { tenantTools: { disconnect: { id: TOOL, organizationId: ORG } } },
          select: { config: true },
        });
      });

      it('404 y sin escribir si la tool es de otra organización', async () => {
        prisma.tenantTool.findFirst.mockResolvedValue(null);

        await expect(service.unlinkIntegration(WF, TOOL, ACTOR)).rejects.toThrow(NotFoundException);
        expect(prisma.workflow.update).not.toHaveBeenCalled();
      });

      it('permite desvincular de un workflow borrado', async () => {
        prisma.workflow.findUnique.mockResolvedValue(scope({ deletedAt: new Date() }));

        await expect(service.unlinkIntegration(WF, TOOL, ACTOR)).resolves.toMatchObject({
          linked: false,
        });
      });

      it('avisa dónde sigue nombrándola el config', async () => {
        prisma.workflow.update.mockResolvedValue({
          config: {
            agents: { general: { tools: [TOOL, 'otra'] }, ventas: { tools: [{ id: TOOL }] } },
            graph: { nodes: [{ id: 'cal', type: 'tool', config: { tool_instance: TOOL } }] },
          },
        });

        const result = await service.unlinkIntegration(WF, TOOL, ACTOR);

        expect(result.stillReferencedIn).toEqual([
          'agents.general.tools',
          'agents.ventas.tools',
          'graph.nodes[0] (cal)',
        ]);
      });
    });
  });
});
