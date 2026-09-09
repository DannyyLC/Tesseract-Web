import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { WorkflowVersionSource } from '@tesseract/database';
import { WorkflowsAdminService } from './workflows-admin.service';
import { WorkflowConfigValidator } from './workflow-config.validator';
import { PrismaService } from '@/platform/database/prisma.service';
import { OrganizationsService } from '@/identity/organizations/organizations.service';
import { AgentsService } from '../agents/agents.service';
import { InvalidWorkflowConfigException } from '@/platform/common/exceptions';
import { hashConfig } from './workflow-config.utils';

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
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'v-new', ...data })),
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
        { provide: OrganizationsService, useValue: { canAddWorkflow: jest.fn().mockResolvedValue(true) } },
        // Sin motor disponible: la validación de catálogo se omite, como en producción
        // cuando el servicio de agentes está caído.
        { provide: AgentsService, useValue: { getNodeCatalog: jest.fn().mockRejectedValue(new Error('down')) } },
        { provide: ConfigService, useValue: { get: (_k: string, d: unknown) => d } },
      ],
    }).compile();

    service = module.get(WorkflowsAdminService);
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
      const reordered = { agents: validConfig().agents, graph: validConfig().graph, type: 'agent', post_turn_actions: validConfig().post_turn_actions };

      const result = await service.updateConfig('wf-1', reordered as any, 9, ACTOR);

      expect(result.changed).toBe(false);
    });

    it('422 con TODOS los errores acumulados, sin escribir', async () => {
      prisma.workflow.findUnique.mockResolvedValue(current());
      const broken = {
        type: 'agent',
        graph: { type: 'pipeline', nodes: [{ id: 'a', type: 'agent' }, { id: 'a', type: 'agent' }], edges: [{ from: 'START', to: 'fantasma' }] },
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
      expect(nuevaCall[0].data).toMatchObject({ version: 10, source: WorkflowVersionSource.ADMIN_UI });
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
});
