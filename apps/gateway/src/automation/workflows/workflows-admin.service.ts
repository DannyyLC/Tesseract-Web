import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WorkflowVersionSource } from '@tesseract/database';
import { DEFAULT_PAGE_SIZE, WorkflowCategory } from '@tesseract/types';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/platform/database/prisma.service';
import { InvalidWorkflowConfigException } from '@/platform/common/exceptions';
import { OrganizationsService } from '@/identity/organizations/organizations.service';
import { AgentsService } from '../agents/agents.service';
import { WorkflowConfigValidator } from './workflow-config.validator';
import {
  assertMaxTokensWithinCategory,
  touchesCategoryCeiling,
} from './category-token-ceiling';
import { configSizeBytes, diffConfigs, hashConfig } from './workflow-config.utils';
import {
  CloneWorkflowDto,
  CreateWorkflowAdminDto,
  QueryVersionsDto,
  QueryWorkflowsAdminDto,
  UpdateWorkflowMetaDto,
} from './dto/admin';

/**
 * Snapshots no-baseline que se conservan por workflow. El baseline nunca se poda.
 * Configurable con WORKFLOW_VERSIONS_TO_KEEP por si un cliente necesita más historia.
 */
const DEFAULT_VERSIONS_TO_KEEP = 30;

interface Actor {
  id?: string;
  email?: string;
}

/**
 * Operaciones de workflows para el super admin: cruzan organizaciones, devuelven el
 * `config` completo (que el CRUD de inquilino oculta a propósito) y mantienen el
 * historial de versiones.
 *
 * Vive aparte de WorkflowsService porque ese ya pasa de 2000 líneas y porque el
 * modelo de acceso es el opuesto: aquí no hay filtro por tenancy, la restricción es
 * el guard de SUPER_ADMIN en el controlador.
 */
@Injectable()
export class WorkflowsAdminService {
  private readonly logger = new Logger(WorkflowsAdminService.name);
  private readonly versionsToKeep: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configValidator: WorkflowConfigValidator,
    private readonly organizationsService: OrganizationsService,
    private readonly agentsService: AgentsService,
    private readonly configService: ConfigService,
  ) {
    this.versionsToKeep = Number(
      this.configService.get('WORKFLOW_VERSIONS_TO_KEEP', DEFAULT_VERSIONS_TO_KEEP),
    );
  }

  // ==========================================================
  // Lectura
  // ==========================================================

  /**
   * Contexto que el editor necesita para poblar sus formularios: el catálogo
   * autodescriptivo del motor (tipos de nodo + sus JSON Schema) y los modelos LLM
   * activos, que son los únicos que la validación aceptará al guardar.
   */
  async getEditorContext() {
    const [nodeCatalog, models] = await Promise.all([
      this.agentsService.getNodeCatalog('pipeline').catch((error) => {
        // Sin motor el editor sigue siendo usable: pierde ayudas, no la edición.
        this.logger.warn(`Node catalog unavailable: ${(error as Error).message}`);
        return null;
      }),
      this.prisma.llmModel.findMany({
        where: { isActive: true },
        select: { id: true, modelName: true, provider: true, tier: true },
        orderBy: [{ provider: 'asc' }, { modelName: 'asc' }],
      }),
    ]);

    return { nodeCatalog, models };
  }

  /** Listado de workflows. Nunca selecciona `config`: son ~100 KB por fila. */
  async findAll(query: QueryWorkflowsAdminDto) {
    const { organizationId, search, includeDeleted, page = 1, limit = DEFAULT_PAGE_SIZE } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.WorkflowWhereInput = {
      ...(organizationId && { organizationId }),
      ...(!includeDeleted && { deletedAt: null }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { description: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.workflow.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          isActive: true,
          isPaused: true,
          isInternal: true,
          version: true,
          totalExecutions: true,
          lastExecutedAt: true,
          updatedAt: true,
          deletedAt: true,
          organizationId: true,
          organization: { select: { id: true, name: true, slug: true } },
          _count: { select: { configVersions: true } },
        },
      }),
      this.prisma.workflow.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  /**
   * Workflow completo CON el config. Incluye las tool instances de la organización
   * para que el editor pueda mostrar nombres en lugar de los UUID que aparecen en
   * `agents[*].tools` y en los nodos `tool`.
   */
  async findOne(workflowId: string) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      include: {
        organization: { select: { id: true, name: true, slug: true, plan: true } },
        tags: { select: { id: true, name: true } },
        tenantTools: {
          select: {
            id: true,
            displayName: true,
            isConnected: true,
            status: true,
            allowedFunctions: true,
            toolCatalog: {
              select: {
                id: true,
                toolName: true,
                displayName: true,
                icon: true,
                functions: { select: { functionName: true, displayName: true } },
              },
            },
          },
        },
        _count: { select: { configVersions: true, executions: true } },
      },
    });

    if (!workflow) throw new NotFoundException('Workflow no encontrado');

    // El editor devuelve este hash al guardar; es lo que permite detectar que el
    // config cambió por fuera (p. ej. un UPDATE manual) aunque `version` no se movió.
    return { ...workflow, configHash: hashConfig(workflow.config) };
  }

  // ==========================================================
  // Escritura del config
  // ==========================================================

  /**
   * Guarda un config nuevo preservando el anterior.
   *
   * Puntos que importan:
   * - Si el config no cambió (hash igual) no se escribe nada: evita llenar el
   *   historial de versiones idénticas.
   * - La primera vez que se toca un workflow se guarda un BASELINE con el estado
   *   previo. Sin eso, la primera edición desde la UI perdería para siempre lo que
   *   había antes, que es justo lo que este historial existe para evitar.
   * - El UPDATE lleva `version: expectedVersion` en el WHERE: es un compare-and-swap
   *   real, sin ventana entre leer y escribir. Si alguien guardó primero (otra
   *   pestaña, o un UPDATE manual por SQL), afecta 0 filas y responde 409.
   */
  async updateConfig(
    workflowId: string,
    config: Record<string, any>,
    expectedVersion: number,
    actor: Actor,
    options: { note?: string; source?: WorkflowVersionSource; expectedHash?: string } = {},
  ) {
    const current = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { id: true, version: true, config: true, name: true, organizationId: true },
    });
    if (!current) throw new NotFoundException('Workflow no encontrado');

    if (current.version !== expectedVersion) {
      throw new ConflictException(
        `El workflow cambió mientras editabas (esperabas la versión ${expectedVersion}, ` +
          `la actual es la ${current.version}). Recarga para no perder los cambios de la otra edición.`,
      );
    }

    const currentHash = hashConfig(current.config);

    // El contador de versión no ve las ediciones hechas por SQL directo: cambian el
    // config sin tocar `version`. Comparar el hash de lo que el editor cargó es lo
    // único que detecta ese caso antes de sobrescribirlo.
    if (options.expectedHash && options.expectedHash !== currentHash) {
      throw new ConflictException(
        'El config cambió fuera del editor (probablemente por una edición directa en la base de datos). ' +
          'Recarga para trabajar sobre la versión actual y no perder ese cambio.',
      );
    }

    const newHash = hashConfig(config);
    if (newHash === currentHash) {
      return { workflow: current, changed: false, version: null };
    }

    const { valid, errors } = await this.configValidator.collect(config);
    if (!valid) {
      throw new InvalidWorkflowConfigException(errors.join(' | '), { errors });
    }

    return this.prisma.$transaction(async (tx) => {
      const hasHistory = await tx.workflowConfigVersion.count({ where: { workflowId } });

      if (hasHistory === 0) {
        // Dos guardados simultáneos podrían intentar crear el mismo baseline. Uno
        // pierde por la unique (workflowId, version); sin este catch saldría como un
        // 500 de Prisma en vez de un conflicto entendible.
        await tx.workflowConfigVersion
          .create({
            data: {
              workflowId,
              version: current.version,
              config: current.config as Prisma.InputJsonValue,
              configHash: hashConfig(current.config),
              sizeBytes: configSizeBytes(current.config),
              isBaseline: true,
              source: WorkflowVersionSource.BASELINE,
              note: 'Estado previo a la primera edición desde el panel',
            },
          })
          .catch((error) => {
            if (error?.code === 'P2002') {
              throw new ConflictException(
                'Otro guardado se adelantó por milisegundos. Intenta de nuevo.',
              );
            }
            throw error;
          });
      }

      // Compare-and-swap: la versión esperada va en el WHERE, no comparada en memoria.
      const updated = await tx.workflow.updateMany({
        where: { id: workflowId, version: expectedVersion },
        data: { config: config as Prisma.InputJsonValue, version: { increment: 1 } },
      });
      if (updated.count === 0) {
        throw new ConflictException(
          'El workflow cambió mientras guardabas. Recarga e intenta de nuevo.',
        );
      }

      const newVersion = await tx.workflowConfigVersion.create({
        data: {
          workflowId,
          version: expectedVersion + 1,
          config: config as Prisma.InputJsonValue,
          configHash: newHash,
          sizeBytes: configSizeBytes(config),
          source: options.source ?? WorkflowVersionSource.ADMIN_UI,
          note: options.note,
          createdById: actor.id,
          createdByEmail: actor.email,
        },
      });

      await this.pruneVersions(tx, workflowId);

      this.logger.log(
        `Config actualizado: workflow ${workflowId} (v${expectedVersion} -> v${expectedVersion + 1}) por userId=${actor.id ?? 'desconocido'}`,
      );

      const workflow = await tx.workflow.findUnique({
        where: { id: workflowId },
        select: { id: true, name: true, version: true, updatedAt: true },
      });

      return { workflow, changed: true, version: newVersion };
    });
  }

  /** Dry-run de validación: mismos errores que al guardar, sin escribir. */
  async validateConfig(config: Record<string, any>) {
    return this.configValidator.collect(config);
  }

  /**
   * Poda las versiones más viejas conservando siempre el baseline, que es la única
   * copia de lo que existía antes de que la UI tocara el workflow.
   */
  private async pruneVersions(tx: Prisma.TransactionClient, workflowId: string) {
    const stale = await tx.workflowConfigVersion.findMany({
      where: { workflowId, isBaseline: false },
      orderBy: { createdAt: 'desc' },
      skip: this.versionsToKeep,
      select: { id: true },
    });
    if (stale.length === 0) return;

    await tx.workflowConfigVersion.deleteMany({ where: { id: { in: stale.map((v) => v.id) } } });
    this.logger.log(`Podadas ${stale.length} versiones viejas del workflow ${workflowId}`);
  }

  /** Metadata del workflow. No toca el config ni su versión. */
  async updateMeta(workflowId: string, dto: UpdateWorkflowMetaDto) {
    const exists = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      select: {
        id: true,
        organizationId: true,
        isInternal: true,
        category: true,
        maxHistoryTokens: true,
      },
    });
    if (!exists) throw new NotFoundException('Workflow no encontrado');

    // Mismo techo por categoría que en la ruta de tenant: el super admin puede mover
    // un workflow de categoría, y bajarlo sin tocar los tokens lo dejaría fuera de rango.
    if (touchesCategoryCeiling(dto)) {
      assertMaxTokensWithinCategory({
        category: (dto.category as WorkflowCategory) ?? (exists.category as WorkflowCategory),
        maxHistoryTokens: dto.maxHistoryTokens ?? exists.maxHistoryTokens,
      });
    }

    // Publicar (isInternal true→false) vuelve al workflow visible y lo mete al
    // conteo del plan del cliente — igual que create(), no puede saltarse el
    // límite en silencio. Si ya era público, o se está ocultando, no hay nada que
    // checar: el conteo no sube.
    if (dto.isInternal === false && exists.isInternal) {
      await this.assertCanAddWorkflow(exists.organizationId);
    }

    return this.prisma.workflow.update({
      where: { id: workflowId },
      data: { ...dto },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        maxHistoryTokens: true,
        isActive: true,
        isPaused: true,
        isInternal: true,
        timeout: true,
        maxRetries: true,
        version: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Borra un workflow de cualquier organización (soft delete).
   *
   * Mismo shape que el soft delete de tenant (`WorkflowsService.remove()`):
   * `deletedAt` + `isActive: false`, así que de paso deja de ejecutarse (cron,
   * API, WhatsApp) sin tener que tocar nada más. No hay chequeo de pertenencia
   * como en la versión de tenant porque el super admin ya apunta por id.
   */
  async remove(workflowId: string) {
    const exists = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Workflow no encontrado');

    const workflow = await this.prisma.workflow.update({
      where: { id: workflowId },
      // Sin condición sobre el estado actual: repetir el borrado (o borrar algo
      // que ya estaba eliminado) es un no-op seguro, no un error.
      data: { deletedAt: new Date(), isActive: false },
    });

    this.logger.log(`Workflow ${workflowId} eliminado (soft delete) por super admin`);
    return workflow;
  }

  /**
   * Restaura un workflow eliminado. No reactiva `isActive`: el super admin lo
   * prende aparte desde Ajustes, para no revivir ejecuciones de golpe justo al
   * restaurar.
   */
  async restore(workflowId: string) {
    const exists = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { id: true, deletedAt: true, isInternal: true, organizationId: true },
    });
    if (!exists) throw new NotFoundException('Workflow no encontrado');

    // Un workflow público (isInternal:false) vuelve a contar contra el límite del
    // plan al restaurarse — mismo chequeo que publicar. Si ya estaba restaurado no
    // hay nada nuevo que sumar al conteo, así que no hace falta checar de nuevo.
    if (exists.deletedAt && !exists.isInternal) {
      await this.assertCanAddWorkflow(exists.organizationId);
    }

    const workflow = await this.prisma.workflow.update({
      where: { id: workflowId },
      data: { deletedAt: null },
    });

    this.logger.log(`Workflow ${workflowId} restaurado por super admin`);
    return workflow;
  }

  // ==========================================================
  // Historial
  // ==========================================================

  /** Listado del historial. Nunca selecciona `config`: 30 snapshots serían megabytes. */
  async listVersions(workflowId: string, query: QueryVersionsDto) {
    const { page = 1, limit = DEFAULT_PAGE_SIZE } = query;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.workflowConfigVersion.findMany({
        where: { workflowId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          version: true,
          configHash: true,
          sizeBytes: true,
          isBaseline: true,
          note: true,
          source: true,
          createdById: true,
          createdByEmail: true,
          createdAt: true,
        },
      }),
      this.prisma.workflowConfigVersion.count({ where: { workflowId } }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  /** El config completo de un snapshot. Es la única lectura que lo trae entero. */
  async getVersion(workflowId: string, versionId: string) {
    const version = await this.prisma.workflowConfigVersion.findFirst({
      where: { id: versionId, workflowId },
    });
    if (!version) throw new NotFoundException('Versión no encontrada');
    return version;
  }

  /**
   * Diff entre un snapshot y el config vigente. Se calcula al vuelo, como `git diff`;
   * lo almacenado son siempre documentos completos.
   */
  async diffVersion(workflowId: string, versionId: string) {
    const [version, workflow] = await Promise.all([
      this.getVersion(workflowId, versionId),
      this.prisma.workflow.findUnique({
        where: { id: workflowId },
        select: { version: true, config: true },
      }),
    ]);
    if (!workflow) throw new NotFoundException('Workflow no encontrado');

    return {
      fromVersion: version.version,
      toVersion: workflow.version,
      entries: diffConfigs(version.config, workflow.config),
    };
  }

  /**
   * Restaura un snapshot. Pasa por updateConfig() para heredar validación, bloqueo
   * optimista y snapshot: restaurar es una edición más, nunca un camino de escritura
   * paralelo que se salte las salvaguardas.
   *
   * Puede fallar legítimamente si el config viejo usa un modelo que ya se desactivó;
   * ese error se muestra tal cual.
   */
  async restoreVersion(
    workflowId: string,
    versionId: string,
    expectedVersion: number,
    actor: Actor,
    note?: string,
  ) {
    const version = await this.getVersion(workflowId, versionId);

    return this.updateConfig(
      workflowId,
      version.config as Record<string, any>,
      expectedVersion,
      actor,
      {
        note: note ?? `Restaurado desde la versión ${version.version}`,
        source: WorkflowVersionSource.RESTORE,
      },
    );
  }

  // ==========================================================
  // Creación
  // ==========================================================

  /**
   * Lanza si la organización ya está en su límite de workflows del plan.
   *
   * La usan `create()` (siempre) y `updateMeta()`/`restore()` (solo cuando el
   * workflow en cuestión pasa a ser público) — un solo mensaje, apuntando a ajustar
   * `customMaxWorkflows` desde el panel de organización en vez de que el super admin
   * se quede sin saber por qué no puede crear/publicar/restaurar.
   */
  private async assertCanAddWorkflow(organizationId: string): Promise<void> {
    const canAdd = await this.organizationsService.canAddWorkflow(organizationId);
    if (canAdd) return;

    const limit = await this.organizationsService.getWorkflowLimit(organizationId);
    throw new ForbiddenException(
      limit === -1
        ? 'La organización no puede crear más workflows'
        : `La organización alcanzó el límite de ${limit} workflows de su plan`,
    );
  }

  /**
   * Crea un workflow en cualquier organización. Respeta el límite de workflows del
   * plan del cliente: el super admin elige por quién crea, no se salta lo que el
   * cliente contrató.
   */
  async create(dto: CreateWorkflowAdminDto, actor: Actor) {
    const { organizationId, note, ...rest } = dto;

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!organization) throw new NotFoundException('Organización no encontrada');

    const { valid, errors } = await this.configValidator.collect(rest.config);
    if (!valid) throw new InvalidWorkflowConfigException(errors.join(' | '), { errors });

    await this.assertCanAddWorkflow(organizationId);

    const workflow = await this.prisma.workflow.create({
      data: {
        name: rest.name,
        description: rest.description,
        category: rest.category,
        maxHistoryTokens: rest.maxHistoryTokens,
        config: rest.config as unknown as Prisma.InputJsonValue,
        isActive: rest.isActive ?? true,
        isPaused: rest.isPaused ?? false,
        schedule: rest.schedule,
        // null (no 'UTC') para que herede la zona de la organización.
        timezone: rest.timezone ?? null,
        timeout: rest.timeout ?? 300,
        maxRetries: rest.maxRetries ?? 3,
        triggerType: rest.triggerType ? [rest.triggerType.toUpperCase() as any] : undefined,
        isInternal: rest.isInternal ?? false,
        organizationId,
      },
    });

    // Snapshot inicial: así el historial arranca con lo que se creó, no con el
    // primer cambio posterior.
    await this.prisma.workflowConfigVersion.create({
      data: {
        workflowId: workflow.id,
        version: workflow.version,
        config: workflow.config as Prisma.InputJsonValue,
        configHash: hashConfig(workflow.config),
        sizeBytes: configSizeBytes(workflow.config),
        isBaseline: true,
        source: WorkflowVersionSource.BASELINE,
        note: note ?? 'Creación',
        createdById: actor.id,
        createdByEmail: actor.email,
      },
    });

    this.logger.log(`Workflow ${workflow.id} creado en ${organizationId} por userId=${actor.id}`);
    return workflow;
  }

  /**
   * Clona un workflow a otra organización.
   *
   * El config se copia tal cual, pero los UUID de tool instances que trae dentro
   * (`agents[*].tools` y los nodos `tool`) pertenecen a la organización de origen y
   * NO son válidos en la destino. Se devuelven en `toolReferences` para que la UI
   * avise que hay que reasignarlas: copiarlas en silencio dejaría un workflow que
   * parece bien y falla al ejecutarse.
   */
  async clone(sourceWorkflowId: string, dto: CloneWorkflowDto, actor: Actor) {
    const source = await this.prisma.workflow.findUnique({
      where: { id: sourceWorkflowId },
      select: {
        config: true,
        category: true,
        maxHistoryTokens: true,
        description: true,
        organizationId: true,
        isInternal: true,
      },
    });
    if (!source) throw new NotFoundException('Workflow origen no encontrado');

    const config = source.config as Record<string, any>;
    const toolReferences = this.collectToolReferences(config);

    const workflow = await this.create(
      {
        organizationId: dto.targetOrganizationId,
        name: dto.name,
        description: dto.description ?? source.description ?? undefined,
        category: source.category,
        maxHistoryTokens: source.maxHistoryTokens,
        config: config as any,
        // Un clon de un workflow todavía interno (en construcción) debe seguir
        // oculto: si create() cayera a su default `false`, quedaría público y
        // cobrando crédito de inmediato en la organización destino.
        isInternal: source.isInternal,
        note: `Clonado del workflow ${sourceWorkflowId}`,
      },
      actor,
    );

    return { workflow, toolReferences };
  }

  /**
   * UUID de tool instances referenciados dentro del config, con el lugar donde
   * aparecen para que la UI pueda señalarlos.
   */
  private collectToolReferences(config: Record<string, any>) {
    const refs: { id: string; location: string }[] = [];

    for (const [agentKey, agent] of Object.entries(config?.agents ?? {})) {
      for (const tool of (agent as any)?.tools ?? []) {
        const id = typeof tool === 'string' ? tool : tool?.id;
        if (id) refs.push({ id, location: `agents.${agentKey}.tools` });
      }
    }

    const nodes: any[] = config?.graph?.nodes ?? [];
    nodes.forEach((node, index) => {
      const id = node?.config?.tool_instance;
      if (id) refs.push({ id, location: `graph.nodes[${index}] (${node.id})` });
    });

    return refs;
  }
}
