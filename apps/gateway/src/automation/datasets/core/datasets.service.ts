import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DatasetDto,
  DatasetField,
  DatasetFieldValuesResponse,
  DatasetImportResultDto,
  DatasetImportRowError,
  DatasetRecordDto,
  DatasetSearchRequest,
  DatasetSearchResponse,
  DatasetSummaryDto,
  DatasetUsageDto,
  SubscriptionPlan as SharedSubscriptionPlan,
  getPlanLimits,
} from '@tesseract/types';
import { Prisma, ToolConnectionStatus } from '@tesseract/database';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { EmailService } from '@/messaging/notifications/email/email.service';
import { maskEmail } from '@/platform/common/utils/mask-email';
import { PrismaService } from '../../../platform/database/prisma.service';
import { parseCsv } from './csv.util';
import { DatasetQueryService } from './dataset-query.service';
import {
  ComputePlan,
  buildComputePlan,
  liveFields,
  mergeFields,
  slugifyKey,
  validateFields,
  validateRecord,
} from './dataset-schema.validator';
import { evaluateFormula, formulaDependencies, parseFormula } from './formula';

/** Techo por importación. Evita que un archivo enorme monopolice una petición. */
const MAX_IMPORT_ROWS = 5000;

/**
 * Filas por lote del recálculo de fórmulas.
 *
 * Se leen y se escriben de mil en mil en vez de fila por fila: con decenas de miles de registros,
 * un `UPDATE` por fila son decenas de miles de viajes a la base. Mil filas son 2 000 parámetros,
 * muy por debajo del techo de 65 535 de Postgres.
 */
const RECOMPUTE_BATCH_SIZE = 1000;

/**
 * Una transacción interactiva de Prisma expira **a los 5 segundos** por defecto, y `PrismaService`
 * no configura otra cosa. Recalcular un catálogo grande se pasa de ahí sin despeinarse y moriría
 * con `P2028` a media columna, así que el límite se sube explícitamente.
 *
 * Los 540 s quedan por debajo del `--timeout=600` con el que el Gateway se despliega en Cloud Run:
 * de nada sirve una transacción que sobreviva a la request que la abrió.
 */
const RECOMPUTE_TRANSACTION_OPTIONS = { timeout: 540_000, maxWait: 10_000 };

/** `toolName` con el que la tool de datasets vive en `ToolCatalog`. */
export const DATASET_TOOL_NAME = 'dataset';

/**
 * Buzón fijo para las solicitudes de conexión workflow↔dataset. No es `SUPPORT_EMAIL_TO`: ese es
 * el soporte general por env, y esta solicitud tiene su propio destino a propósito.
 */
const WORKFLOW_CONNECTION_REQUEST_EMAIL = 'cristobal@fractalops.com.mx';

@Injectable()
export class DatasetsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly datasetQueryService: DatasetQueryService,
    private readonly emailService: EmailService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  // ==========================================
  // Límites de plan
  // ==========================================

  /**
   * Límites vigentes de la organización.
   *
   * Lee los overrides desde `organizations.customMax*`, que es de donde los toma
   * `BillingService.enforceLimits()`; usar otra fuente dejaría dos verdades sobre el mismo límite.
   */
  private async resolveLimits(organizationId: string) {
    const organization = await this.prismaService.organization.findUnique({
      where: { id: organizationId },
      select: { plan: true, customMaxDatasets: true, customMaxDatasetRows: true },
    });

    if (!organization) {
      throw new NotFoundException('Organización no encontrada');
    }

    const planLimits = getPlanLimits(organization.plan as unknown as SharedSubscriptionPlan);

    return {
      maxDatasets: organization.customMaxDatasets ?? planLimits.maxDatasets,
      maxDatasetRows: organization.customMaxDatasetRows ?? planLimits.maxDatasetRows,
    };
  }

  private async countRows(organizationId: string): Promise<number> {
    return this.prismaService.datasetRecord.count({
      where: { dataset: { organizationId, deletedAt: null } },
    });
  }

  async getUsage(organizationId: string): Promise<DatasetUsageDto> {
    const limits = await this.resolveLimits(organizationId);

    const [datasets, rows] = await Promise.all([
      this.prismaService.dataset.count({ where: { organizationId, deletedAt: null } }),
      this.countRows(organizationId),
    ]);

    return {
      datasets,
      maxDatasets: limits.maxDatasets,
      rows,
      maxDatasetRows: limits.maxDatasetRows,
      writesBlocked: limits.maxDatasetRows !== -1 && rows >= limits.maxDatasetRows,
    };
  }

  /**
   * Verifica que quepan `rowsToAdd` filas más.
   *
   * **Solo se consulta al escribir.** Si la organización quedó por encima del límite —lo típico es
   * que haya bajado de plan— conserva sus filas y su agente las sigue consultando; lo único que se
   * bloquea es agregar más. Recortar aquí, como se hace con workflows y API keys, significaría
   * borrar datos que el cliente capturó a mano.
   */
  private async assertRowsFit(organizationId: string, rowsToAdd: number): Promise<void> {
    const limits = await this.resolveLimits(organizationId);

    if (limits.maxDatasetRows === -1) {
      return;
    }

    const current = await this.countRows(organizationId);

    if (current + rowsToAdd > limits.maxDatasetRows) {
      throw new ForbiddenException(
        `Tu plan permite ${limits.maxDatasetRows} filas en total y ya tienes ${current}. ` +
          'Tus datos siguen intactos y tu agente los sigue consultando; para agregar más, ' +
          'libera espacio o sube de plan.',
      );
    }
  }

  // ==========================================
  // Datasets
  // ==========================================

  async list(organizationId: string): Promise<DatasetSummaryDto[]> {
    const datasets = await this.prismaService.dataset.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        workflows: { select: { id: true } },
        _count: { select: { records: true } },
      },
    });

    return datasets.map((dataset) => ({
      id: dataset.id,
      name: dataset.name,
      description: dataset.description,
      fieldCount: liveFields(dataset.fields as unknown as DatasetField[]).length,
      recordCount: dataset._count.records,
      workflowIds: dataset.workflows.map((workflow) => workflow.id),
      createdAt: dataset.createdAt,
      updatedAt: dataset.updatedAt,
    }));
  }

  /** Carga un dataset asegurando que pertenece a la organización que lo pide. */
  private async loadOwned(organizationId: string, datasetId: string) {
    const dataset = await this.prismaService.dataset.findFirst({
      where: { id: datasetId, organizationId, deletedAt: null },
      include: {
        // Con nombre: el detalle lista los workflows conectados, y resolverlos contra el catálogo
        // completo desde el front obligaría a traérselo entero solo para pintar unos cuantos.
        workflows: { select: { id: true, name: true } },
        _count: { select: { records: true } },
      },
    });

    if (!dataset) {
      throw new NotFoundException('Dataset no encontrado');
    }

    return dataset;
  }

  async getById(organizationId: string, datasetId: string): Promise<DatasetDto> {
    const dataset = await this.loadOwned(organizationId, datasetId);

    return {
      id: dataset.id,
      name: dataset.name,
      description: dataset.description,
      fields: liveFields(dataset.fields as unknown as DatasetField[]),
      recordCount: dataset._count.records,
      workflows: dataset.workflows.map((workflow) => ({ id: workflow.id, name: workflow.name })),
      createdAt: dataset.createdAt,
      updatedAt: dataset.updatedAt,
    };
  }

  async create(
    organizationId: string,
    userId: string,
    input: { name: string; description?: string | null; fields: DatasetField[] },
  ): Promise<DatasetDto> {
    const limits = await this.resolveLimits(organizationId);

    if (limits.maxDatasets !== -1) {
      const current = await this.prismaService.dataset.count({
        where: { organizationId, deletedAt: null },
      });

      if (current >= limits.maxDatasets) {
        throw new ForbiddenException(
          `Tu plan permite ${limits.maxDatasets} ${limits.maxDatasets === 1 ? 'dataset' : 'datasets'} ` +
            'y ya lo alcanzaste. Sube de plan para crear otro.',
        );
      }
    }

    const fields = this.normalizeIncomingFields(input.fields);
    validateFields(fields);

    const dataset = await this.prismaService.dataset.create({
      data: {
        organizationId,
        createdByUserId: userId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        fields: fields as unknown as object,
      },
    });

    this.logger.info(
      `Dataset creado: ${dataset.id} (${fields.length} columnas) para org ${organizationId}`,
    );

    return {
      id: dataset.id,
      name: dataset.name,
      description: dataset.description,
      fields,
      recordCount: 0,
      workflows: [],
      createdAt: dataset.createdAt,
      updatedAt: dataset.updatedAt,
    };
  }

  /** Rellena `key` y `order` cuando la UI no los manda, para que el cliente solo escriba el label. */
  private normalizeIncomingFields(fields: DatasetField[]): DatasetField[] {
    return fields.map((field, index) => ({
      ...field,
      key: field.key?.trim() || slugifyKey(field.label ?? ''),
      label: field.label?.trim() ?? '',
      order: index,
      options:
        field.type === 'select'
          ? [...new Set((field.options ?? []).map((option) => option.trim()).filter(Boolean))]
          : undefined,
      // Solo un número se calcula; en cualquier otro tipo la fórmula se descarta, igual que las
      // opciones fuera de un select.
      formula: field.type === 'number' ? field.formula?.trim() || undefined : undefined,
    }));
  }

  async updateMeta(
    organizationId: string,
    datasetId: string,
    input: { name?: string; description?: string | null },
  ): Promise<DatasetDto> {
    await this.loadOwned(organizationId, datasetId);

    await this.prismaService.dataset.update({
      where: { id: datasetId },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined
          ? { description: input.description?.trim() || null }
          : {}),
      },
    });

    return this.getById(organizationId, datasetId);
  }

  /**
   * Reemplaza la definición de columnas respetando la regla aditiva: las que el cliente ya no
   * manda se marcan como borradas en lugar de desaparecer, y sus valores siguen en las filas.
   *
   * Si el cambio afecta a alguna fórmula, aquí se recalcula la columna entera. Es lo que mantiene
   * honesto el diseño: el valor calculado vive guardado en cada fila, así que cambiar la regla
   * obliga a reescribir lo que esa regla producía.
   */
  async updateFields(
    organizationId: string,
    datasetId: string,
    fields: DatasetField[],
  ): Promise<DatasetDto> {
    const dataset = await this.loadOwned(organizationId, datasetId);
    const current = dataset.fields as unknown as DatasetField[];
    const merged = mergeFields(current, this.normalizeIncomingFields(fields));

    if (!this.formulasNeedRecompute(current, merged)) {
      await this.prismaService.dataset.update({
        where: { id: datasetId },
        data: { fields: merged as unknown as object },
      });

      return this.getById(organizationId, datasetId);
    }

    const plan = buildComputePlan(merged);
    const startedAt = Date.now();
    let updatedRows = 0;

    // El schema nuevo y los valores recalculados se commitean juntos: si se guardaran por separado,
    // entre una escritura y la otra el catálogo anunciaría una fórmula que sus filas todavía no
    // reflejan. Y como los lectores no se bloquean (MVCC), el agente sigue cotizando con los
    // valores viejos hasta el commit en vez de ver una mezcla de precios viejos y nuevos.
    await this.prismaService.$transaction(async (tx) => {
      await tx.dataset.update({
        where: { id: datasetId },
        data: { fields: merged as unknown as object },
      });

      updatedRows = await this.recomputeRecords(tx, datasetId, merged, plan);
    }, RECOMPUTE_TRANSACTION_OPTIONS);

    this.logger.info(
      `Dataset ${datasetId}: fórmulas recalculadas, ${updatedRows} filas actualizadas en ` +
        `${Date.now() - startedAt} ms`,
    );

    return this.getById(organizationId, datasetId);
  }

  /**
   * Decide si el cambio de schema obliga a recalcular.
   *
   * El diff se hace entre `current` y `merged`, nunca contra lo que mandó el cliente:
   * `normalizeIncomingFields` reescribe key y order, y `mergeFields` agrega de vuelta las columnas
   * borradas, así que solo esos dos arreglos son comparables entre sí.
   *
   * **Quitarle la fórmula a una columna no ensucia nada**: los últimos valores calculados se quedan
   * y la columna vuelve a ser un número que se captura a mano. Recalcular ahí sería vaciar datos
   * sin que nadie lo haya pedido.
   */
  private formulasNeedRecompute(current: DatasetField[], merged: DatasetField[]): boolean {
    const isLive = (field?: DatasetField): boolean => !!field && !field.deletedAt;
    const currentByKey = new Map(current.map((field) => [field.key, field]));
    const mergedByKey = new Map(merged.map((field) => [field.key, field]));

    for (const field of merged) {
      if (!isLive(field) || !field.formula) {
        continue;
      }

      const before = currentByKey.get(field.key);

      // Fórmula nueva, restaurada, o editada sobre una columna que ya la tenía.
      if (!isLive(before) || before?.formula !== field.formula) {
        return true;
      }

      // La fórmula es la misma, pero alguna de las columnas que usa entró o salió del schema vivo.
      // Sus valores no cambian dentro de un `updateFields`, pero su visibilidad sí, y una
      // dependencia borrada vacía el resultado.
      for (const dependency of formulaDependencies(parseFormula(field.formula))) {
        if (isLive(currentByKey.get(dependency)) !== isLive(mergedByKey.get(dependency))) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Reescribe las columnas calculadas de todas las filas del dataset. Devuelve cuántas cambiaron.
   *
   * Se recalculan **todas** las fórmulas, no solo las que se editaron: con un tope de 30 columnas
   * el costo de CPU es ruido frente al de la escritura, y a cambio desaparece toda una clase de
   * errores —haber calculado mal qué columnas dependían de qué— además de repararse solas las filas
   * que hayan quedado rancias por un fallo anterior.
   *
   * El evaluador es el mismo que usa `validateRecord` al guardar una fila. La fórmula NO se traduce
   * a SQL: el `UPDATE` solo recibe pares (id, valores ya calculados). Dos evaluadores que pudieran
   * discrepar entre sí son justo el fallo que las columnas calculadas existen para evitar.
   */
  private async recomputeRecords(
    tx: Prisma.TransactionClient,
    datasetId: string,
    fields: DatasetField[],
    plan: ComputePlan,
  ): Promise<number> {
    // Las columnas que alimentan las fórmulas son las VIVAS que se capturan a mano. No se puede
    // evaluar contra `data` tal cual viene: el borrado de columna es lógico y su valor sigue
    // físicamente dentro del JSON de la fila, así que una fórmula seguiría calculando con una
    // columna que ya no existe para nadie. Es la misma regla que aplica `validateRecord` al guardar.
    const inputKeys = liveFields(fields)
      .filter((field) => !field.formula)
      .map((field) => field.key);

    let cursor = '';
    let updated = 0;

    for (;;) {
      // Paginado por keyset y no con OFFSET: dentro de la transacción el snapshot es estable, así
      // que avanzar por `id` es seguro y no degrada conforme se avanza. Traer las decenas de miles
      // de filas de golpe no cabría cómodo en la memoria del proceso.
      const page = await tx.$queryRaw<{ id: string; data: Record<string, unknown> }[]>(
        Prisma.sql`
          SELECT "id", "data"
          FROM "dataset_records"
          WHERE "datasetId" = ${datasetId} AND "id" > ${cursor}
          ORDER BY "id"
          LIMIT ${RECOMPUTE_BATCH_SIZE}
        `,
      );

      if (page.length === 0) {
        return updated;
      }

      cursor = page[page.length - 1].id;

      const patches: { id: string; patch: Record<string, number | null> }[] = [];

      for (const row of page) {
        // Copia de trabajo con solo los operandos válidos. El plan viene en orden topológico, así
        // que una fórmula encadenada lee el valor recién calculado de la anterior, no el que traía
        // la fila.
        const values: Record<string, unknown> = {};

        for (const key of inputKeys) {
          values[key] = row.data[key] ?? null;
        }

        const patch: Record<string, number | null> = {};
        let changed = false;

        for (const { key, node } of plan) {
          const value = evaluateFormula(node, values);

          values[key] = value;
          patch[key] = value;

          if (value !== (row.data[key] ?? null)) {
            changed = true;
          }
        }

        // Saltarse las filas cuyo resultado no cambió es la mayor economía disponible: `data` tiene
        // un índice GIN, así que cada UPDATE reescribe su entrada e impide un HOT update.
        if (changed) {
          patches.push({ id: row.id, patch });
        }
      }

      if (patches.length > 0) {
        await tx.$executeRaw(
          Prisma.sql`
            UPDATE "dataset_records" AS r
            SET "data" = r."data" || v."patch"::jsonb,
                "updatedAt" = NOW()
            FROM (VALUES ${Prisma.join(
              patches.map(
                ({ id, patch }) => Prisma.sql`(${id}::text, ${JSON.stringify(patch)}::jsonb)`,
              ),
            )}) AS v("id", "patch")
            WHERE r."id" = v."id"
          `,
        );

        updated += patches.length;
      }
    }
  }

  /**
   * Borrado lógico. Desenlaza el dataset de sus workflows para que ningún agente siga anunciando
   * una tool que ya no responde, pero las filas se conservan.
   */
  async remove(organizationId: string, datasetId: string): Promise<void> {
    await this.loadOwned(organizationId, datasetId);

    // La instancia de tool se va con el dataset: dejarla viva anunciaría al agente una búsqueda
    // que ya no responde. El soft delete conserva el histórico de ejecuciones que la usaron.
    const tenantTools = await this.prismaService.tenantTool.findMany({
      where: {
        organizationId,
        deletedAt: null,
        toolCatalog: { toolName: DATASET_TOOL_NAME },
        config: { path: ['dataset_id'], equals: datasetId },
      },
      select: { id: true },
    });

    const now = new Date();

    await this.prismaService.$transaction([
      this.prismaService.dataset.update({
        where: { id: datasetId },
        data: { deletedAt: now, workflows: { set: [] } },
      }),
      // Una por una y no un `updateMany`: desenlazar de los workflows es una escritura anidada
      // sobre la relación, y `updateMany` no las admite.
      //
      // El `set: []` no es cosmético. Marcar `deletedAt` deja la fila de `WorkflowToTenantTool`
      // en pie, y el payload del agente arma sus tools desde esa relación: el tool muerto seguía
      // viajando con `config` a medias —sin `fields`, sin `api_base`, sin token—, así que el
      // runtime lo descartaba y el agente se quedaba sin catálogo. Mismo orden que sigue
      // `TenantToolService.deleteTool()`.
      ...tenantTools.map((tool) =>
        this.prismaService.tenantTool.update({
          where: { id: tool.id },
          data: {
            deletedAt: now,
            isConnected: false,
            status: ToolConnectionStatus.DISCONNECTED,
            workflows: { set: [] },
          },
        }),
      ),
    ]);

    this.logger.info(`Dataset ${datasetId} borrado (lógico) en org ${organizationId}`);
  }

  // ==========================================
  // Enlace con workflows
  // ==========================================

  /**
   * Encuentra —o crea— la `TenantTool` que representa este dataset.
   *
   * El dataset se le entrega al agente como una tool más, así que hereda gratis el pool de tools
   * por workflow, la asignación por agente, `allowedFunctions` y el filtrado del registry: el motor
   * no necesita saber que existen los datasets.
   *
   * El cliente nunca ve esta instancia ni la palabra "tool": para él solo enlazó un catálogo a un
   * workflow.
   *
   * `userId` es opcional a propósito: `updateTenantTool`/`addWorkflowToTenantTool` en
   * `TenantToolService` usan `createdByUserId` como guarda de permisos (solo su creador o un
   * OWNER pueden tocarla). Cuando conecta un miembro real de la organización, se le asigna a él.
   * Cuando conecta el super admin desde el panel — no es miembro de esta organización, vive en
   * `platform` — se deja en `NULL` para no dejar la tool "bloqueada" para el propio cliente.
   */
  private async ensureTenantTool(
    organizationId: string,
    datasetId: string,
    name: string,
    userId?: string,
  ) {
    const existing = await this.prismaService.tenantTool.findFirst({
      where: {
        organizationId,
        deletedAt: null,
        toolCatalog: { toolName: DATASET_TOOL_NAME },
        config: { path: ['dataset_id'], equals: datasetId },
      },
      select: { id: true },
    });

    if (existing) {
      return existing.id;
    }

    const catalog = await this.prismaService.toolCatalog.findUnique({
      where: { toolName: DATASET_TOOL_NAME },
      select: { id: true, functions: { select: { functionName: true } } },
    });

    if (!catalog) {
      throw new BadRequestException(
        'La tool de datasets no está registrada en el catálogo. Corre el seed de tool catalogs.',
      );
    }

    // `tenant_tools` tiene un índice único parcial sobre (organizationId, displayName) entre las
    // activas: dos datasets con el mismo nombre chocarían al enlazarse.
    const displayName = await this.uniqueToolDisplayName(organizationId, name);

    const created = await this.prismaService.tenantTool.create({
      data: {
        organizationId,
        toolCatalogId: catalog.id,
        displayName,
        config: { dataset_id: datasetId },
        allowedFunctions: catalog.functions.map((fn) => fn.functionName),
        createdByUserId: userId,
        // No hay OAuth que completar: la credencial es un token con alcance que el Gateway firma
        // al construir el payload de cada ejecución.
        isConnected: true,
        status: ToolConnectionStatus.CONNECTED,
        connectedAt: new Date(),
      },
      select: { id: true },
    });

    return created.id;
  }

  private async uniqueToolDisplayName(organizationId: string, name: string): Promise<string> {
    const base = `Datos: ${name}`.slice(0, 80);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base} (${attempt + 1})`;
      const clash = await this.prismaService.tenantTool.findFirst({
        where: { organizationId, displayName: candidate, deletedAt: null },
        select: { id: true },
      });

      if (!clash) {
        return candidate;
      }
    }

    return `${base} ${Date.now()}`;
  }

  /**
   * Conecta el dataset a un workflow: el agente pasa a poder consultarlo.
   *
   * `userId` es quien ejecuta la acción — ver el comentario de `ensureTenantTool()`. Se omite
   * (`undefined`) cuando conecta el super admin desde el panel.
   */
  async linkWorkflow(
    organizationId: string,
    datasetId: string,
    workflowId: string,
    userId?: string,
  ): Promise<void> {
    const dataset = await this.loadOwned(organizationId, datasetId);

    const workflow = await this.prismaService.workflow.findFirst({
      where: { id: workflowId, organizationId, deletedAt: null },
      select: { id: true },
    });

    if (!workflow) {
      throw new NotFoundException('linkWorkflow >> Workflow no encontrado');
    }

    const tenantToolId = await this.ensureTenantTool(
      organizationId,
      datasetId,
      dataset.name,
      userId,
    );

    await this.prismaService.$transaction([
      this.prismaService.dataset.update({
        where: { id: datasetId },
        data: { workflows: { connect: { id: workflowId } } },
      }),
      this.prismaService.tenantTool.update({
        where: { id: tenantToolId },
        data: { workflows: { connect: { id: workflowId } } },
      }),
    ]);

    this.logger.info(`Dataset ${datasetId} enlazado al workflow ${workflowId}`);
  }

  async unlinkWorkflow(
    organizationId: string,
    datasetId: string,
    workflowId: string,
  ): Promise<void> {
    await this.loadOwned(organizationId, datasetId);

    const tenantTool = await this.prismaService.tenantTool.findFirst({
      where: {
        organizationId,
        deletedAt: null,
        toolCatalog: { toolName: DATASET_TOOL_NAME },
        config: { path: ['dataset_id'], equals: datasetId },
      },
      select: { id: true },
    });

    await this.prismaService.$transaction([
      this.prismaService.dataset.update({
        where: { id: datasetId },
        data: { workflows: { disconnect: { id: workflowId } } },
      }),
      ...(tenantTool
        ? [
            this.prismaService.tenantTool.update({
              where: { id: tenantTool.id },
              data: { workflows: { disconnect: { id: workflowId } } },
            }),
          ]
        : []),
    ]);
  }

  /**
   * El cliente ya no conecta el workflow él mismo desde este flujo: solo le avisa a soporte, que
   * hace el enlace a mano tras confirmar con él qué necesita. El correo va a un buzón propio, no a
   * `SUPPORT_EMAIL_TO` — es una bandeja dedicada a estas solicitudes.
   */
  async requestWorkflowConnection(
    organizationId: string,
    datasetId: string,
    workflowIds: string[],
    userName: string,
    userEmail: string,
  ): Promise<boolean> {
    const dataset = await this.loadOwned(organizationId, datasetId);

    const workflows = await this.prismaService.workflow.findMany({
      where: { id: { in: workflowIds }, organizationId, deletedAt: null },
      select: { id: true, name: true },
    });

    if (workflows.length === 0) {
      throw new NotFoundException('requestWorkflowConnection >> Workflow no encontrado');
    }

    const organization = await this.prismaService.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });
    const organizationName = organization?.name ?? 'Organización desconocida';

    const now = new Date();
    const dateString = now.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const dateTime = `${dateString} a las ${now.toLocaleTimeString('es-ES')}`;

    // Uno solo o varios, mismo correo: es justo lo que evita mandar una solicitud por workflow.
    const workflowsList = workflows
      .map((workflow) => `- ${workflow.name} (${workflow.id})`)
      .join('\n');
    const userMessage =
      `Catálogo: ${dataset.name} (${datasetId})\n` + `Workflows solicitados:\n${workflowsList}`;

    try {
      const emailResult = await this.emailService.sendServiceRequestEmail(
        process.env.SMTP_EMAIL_FROM ?? 'no-reply@fractalops.com.mx',
        WORKFLOW_CONNECTION_REQUEST_EMAIL,
        userEmail,
        userName,
        'Solicitud de conexión de workflow a catálogo',
        userMessage,
        organizationName,
        organizationId,
        dateTime,
      );

      if (!emailResult) {
        this.logger.error(
          `Failed to send workflow connection request email for user ${maskEmail(userEmail)}`,
        );
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error('Error sending workflow connection request email', error);
      return false;
    }
  }

  // ==========================================
  // Consulta
  // ==========================================

  /**
   * Búsqueda con verificación de pertenencia. Es la misma que ejecuta la tool del agente: así lo
   * que el cliente prueba desde el dashboard es exactamente lo que su bot va a encontrar.
   */
  async search(
    organizationId: string,
    datasetId: string,
    request: DatasetSearchRequest,
  ): Promise<DatasetSearchResponse> {
    const dataset = await this.loadOwned(organizationId, datasetId);

    return this.datasetQueryService.search(
      datasetId,
      dataset.fields as unknown as DatasetField[],
      request,
    );
  }

  async fieldValues(
    organizationId: string,
    datasetId: string,
    field: string,
    limit = 100,
  ): Promise<DatasetFieldValuesResponse> {
    const dataset = await this.loadOwned(organizationId, datasetId);

    return this.datasetQueryService.fieldValues(
      datasetId,
      dataset.fields as unknown as DatasetField[],
      field,
      limit,
    );
  }

  // ==========================================
  // Filas
  // ==========================================

  async listRecords(
    organizationId: string,
    datasetId: string,
    limit = 50,
    offset = 0,
    query?: string,
  ): Promise<{ total: number; items: DatasetRecordDto[] }> {
    await this.loadOwned(organizationId, datasetId);

    // Con texto libre, delega al mismo motor que usa el agente (`search_dataset`) en vez de
    // reimplementar el ILIKE: mismo resultado que vería el bot, mismos límites (solo columnas
    // `text`, no `select`/`number`/`date` — esas se filtran por valor exacto o rango).
    const trimmedQuery = query?.trim();
    if (trimmedQuery) {
      return this.search(organizationId, datasetId, { query: trimmedQuery, limit, offset });
    }

    const [total, records] = await Promise.all([
      this.prismaService.datasetRecord.count({ where: { datasetId } }),
      this.prismaService.datasetRecord.findMany({
        where: { datasetId },
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit, 200),
        skip: offset,
      }),
    ]);

    return {
      total,
      items: records.map((record) => ({
        id: record.id,
        data: record.data as Record<string, string | number | null>,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      })),
    };
  }

  /** Una fila por id. La usa `get_dataset_item` para devolver la ficha completa. */
  async getRecord(
    organizationId: string,
    datasetId: string,
    recordId: string,
  ): Promise<DatasetRecordDto | null> {
    const record = await this.prismaService.datasetRecord.findFirst({
      where: { id: recordId, datasetId, dataset: { organizationId, deletedAt: null } },
    });

    if (!record) {
      return null;
    }

    return {
      id: record.id,
      data: record.data as Record<string, string | number | null>,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  async createRecord(
    organizationId: string,
    datasetId: string,
    data: Record<string, unknown>,
  ): Promise<DatasetRecordDto> {
    const dataset = await this.loadOwned(organizationId, datasetId);
    await this.assertRowsFit(organizationId, 1);

    const normalized = validateRecord(dataset.fields as unknown as DatasetField[], data);

    const record = await this.prismaService.datasetRecord.create({
      data: { datasetId, data: normalized },
    });

    return {
      id: record.id,
      data: normalized,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  /**
   * Editar no consume cupo: no aumenta el conteo de filas, así que una organización por encima de
   * su límite puede seguir corrigiendo lo que ya tiene (y depurarlo para volver a estar debajo).
   */
  async updateRecord(
    organizationId: string,
    datasetId: string,
    recordId: string,
    data: Record<string, unknown>,
  ): Promise<DatasetRecordDto> {
    const dataset = await this.loadOwned(organizationId, datasetId);
    const existing = await this.prismaService.datasetRecord.findFirst({
      where: { id: recordId, datasetId },
    });

    if (!existing) {
      throw new NotFoundException('Fila no encontrada');
    }

    const normalized = validateRecord(dataset.fields as unknown as DatasetField[], data);

    const record = await this.prismaService.datasetRecord.update({
      where: { id: recordId },
      data: { data: normalized },
    });

    return {
      id: record.id,
      data: normalized,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  async deleteRecord(organizationId: string, datasetId: string, recordId: string): Promise<void> {
    await this.loadOwned(organizationId, datasetId);

    const deleted = await this.prismaService.datasetRecord.deleteMany({
      where: { id: recordId, datasetId },
    });

    if (deleted.count === 0) {
      throw new NotFoundException('Fila no encontrada');
    }
  }

  /**
   * Borra todas las filas del dataset. El dataset y su schema se conservan —a diferencia de
   * `remove()`, que da de baja el catálogo entero— así que sigue enlazado a sus workflows y listo
   * para recibir una captura o importación nueva.
   */
  async clearRecords(organizationId: string, datasetId: string): Promise<{ deleted: number }> {
    await this.loadOwned(organizationId, datasetId);

    const { count } = await this.prismaService.datasetRecord.deleteMany({
      where: { datasetId },
    });

    return { deleted: count };
  }

  /**
   * Importación desde CSV.
   *
   * El archivo llega como texto en el body: el navegador lo lee y lo manda, así que no hace falta
   * infraestructura de subida de archivos que el Gateway hoy no tiene.
   *
   * Las filas válidas se guardan y las inválidas se reportan con su número de línea, en vez de
   * abortar todo el archivo por un dato mal escrito en la fila 180.
   */
  async importCsv(
    organizationId: string,
    datasetId: string,
    csv: string,
  ): Promise<DatasetImportResultDto> {
    const dataset = await this.loadOwned(organizationId, datasetId);
    const fields = liveFields(dataset.fields as unknown as DatasetField[]);
    const rows = parseCsv(csv);

    if (rows.length < 2) {
      throw new BadRequestException(
        'El archivo necesita una fila de encabezados y al menos una fila de datos',
      );
    }

    const [header, ...body] = rows;

    if (body.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(
        `El archivo trae ${body.length} filas y el máximo por importación es ${MAX_IMPORT_ROWS}. ` +
          'Divídelo en varios archivos.',
      );
    }

    // Las columnas calculadas no se mapean: su valor sale de la fórmula, así que si el archivo trae
    // una, se ignora. Tienen que quedar fuera también del chequeo de más abajo, o un CSV cuyas
    // únicas coincidencias fueran calculadas pasaría el filtro e importaría filas vacías.
    const capturable = fields.filter((field) => !field.formula);

    // El encabezado puede venir con la `key` o con el nombre visible de la columna: pedirle al
    // cliente que conozca las keys internas sería absurdo cuando la UI se las esconde.
    const byHeader = new Map<string, DatasetField>();
    for (const field of capturable) {
      byHeader.set(field.key.toLowerCase(), field);
      byHeader.set(field.label.toLowerCase(), field);
    }

    const columns = header.map((name) => byHeader.get(name.trim().toLowerCase()) ?? null);

    if (columns.every((column) => column === null)) {
      throw new BadRequestException(
        `Ninguna columna del archivo coincide con el dataset. Se esperaba alguna de: ${capturable
          .map((field) => field.label)
          .join(', ')}`,
      );
    }

    // Las fórmulas se compilan una vez para todo el archivo, no una vez por fila.
    const plan = buildComputePlan(dataset.fields as unknown as DatasetField[]);

    const errors: DatasetImportRowError[] = [];
    const valid: Record<string, string | number | null>[] = [];

    body.forEach((cells, index) => {
      const raw: Record<string, unknown> = {};

      columns.forEach((field, columnIndex) => {
        if (field) {
          raw[field.key] = cells[columnIndex] ?? '';
        }
      });

      try {
        valid.push(validateRecord(dataset.fields as unknown as DatasetField[], raw, plan));
      } catch (error) {
        errors.push({
          // +2: el encabezado es la fila 1 y el índice arranca en 0.
          row: index + 2,
          message: error instanceof Error ? error.message : 'Fila inválida',
        });
      }
    });

    if (valid.length > 0) {
      await this.assertRowsFit(organizationId, valid.length);

      await this.prismaService.datasetRecord.createMany({
        data: valid.map((data) => ({ datasetId, data })),
      });
    }

    this.logger.info(
      `Importación en dataset ${datasetId}: ${valid.length} filas, ${errors.length} rechazadas`,
    );

    return {
      imported: valid.length,
      failed: errors.length,
      // Un archivo mal mapeado genera un error por fila; mostrar las primeras basta para
      // entender qué se rompió sin devolver 5000 mensajes iguales.
      errors: errors.slice(0, 50),
    };
  }
}
