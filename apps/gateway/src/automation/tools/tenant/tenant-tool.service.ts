import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PaginatedResponse,
  DashboardTenantToolDto,
  WhatsappOutboundStatusDto,
} from '@tesseract/types';
import { CursorPaginatedResponseUtils } from '../../../platform/common/responses/cursor-paginated-response';
import { PrismaService } from '../../../platform/database/prisma.service';
import { CreateTenantToolDto } from './dto/create-tenant-tool.dto';
import { UpdateTenantToolDto } from './dto/update-tenant-tool.dto';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { Prisma, ToolConnectionStatus, UserRole } from '@tesseract/database';
import { ToolHealthService } from '../core/tool-health.service';

/**
 * Campos extra que necesita el cálculo de salud de la credencial. Se piden en el
 * select pero no se devuelven al front: `scopes` y los scopes del catálogo son
 * ruido para la UI, que solo necesita saber qué funciones quedaron bloqueadas.
 */
const HEALTH_SELECT = {
  credential: { select: { scopes: true } },
  toolCatalog: {
    select: {
      toolName: true,
      displayName: true,
      icon: true,
      category: true,
      provider: true,
      functions: { select: { functionName: true, displayName: true, oauthScopes: true } },
    },
  },
} as const;

@Injectable()
export class TenantToolService {
  constructor(
    private readonly prismaService: PrismaService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly toolHealthService: ToolHealthService,
  ) {}

  /** Quita del payload lo que solo servía para calcular la salud. */
  private toDashboardDto(tool: any): DashboardTenantToolDto {
    const { credential, toolCatalog, ...rest } = tool;
    const { functions = [], ...catalog } = toolCatalog ?? {};

    return {
      ...rest,
      toolCatalog: catalog,
      blockedFunctions: this.toolHealthService.findScopeGap({
        allowedFunctions: tool.allowedFunctions,
        credential,
        toolCatalog: { functions },
      }).blockedFunctions,
    };
  }

  async getDashboardData(
    organizationId: string,
    cursor: string | null = null,
    pageSize = 10,
    paginationAction: 'next' | 'prev' | null = null,
  ): Promise<PaginatedResponse<DashboardTenantToolDto> | null> {
    try {
      const tenantTools = await this.prismaService.tenantTool.findMany({
        where: {
          organizationId,
          deletedAt: null,
        },
        cursor: cursor ? { id: cursor } : undefined,
        skip: cursor ? 1 : 0,
        take:
          paginationAction === 'next' || paginationAction === null
            ? (pageSize ?? 10) + 1
            : -((pageSize ?? 10) + 1),
        select: {
          id: true,
          displayName: true,
          status: true,
          isConnected: true,
          createdAt: true,
          createdByUserId: true,
          allowedFunctions: true,
          ...HEALTH_SELECT,
        },
        orderBy: { createdAt: 'desc' },
      });
      return await CursorPaginatedResponseUtils.getInstance().build(
        tenantTools.map((tool) => this.toDashboardDto(tool)),
        pageSize,
        paginationAction,
      );
    } catch (error: any) {
      this.logger.error(`Error fetching dashboard data: ${error?.message ?? 'Unknown error'}`);
      return null;
    }
  }

  // ============================================
  // ADMIN (super admin, cross-organización)
  // ============================================
  /**
   * Todas las tenant tools de todas las organizaciones, para ubicar a qué organización
   * (y qué workflows) pertenece un id — no hay forma de saberlo desde `/integrations`,
   * que resuelve la organización desde el JWT de quien llama. Búsqueda simple por
   * nombre o id, paginado con página/límite (no cursor): es una pantalla de consulta,
   * no una lista que cambie mientras la estás viendo.
   */
  async findAllForAdmin(query: {
    search?: string;
    organizationId?: string;
    page?: number;
    limit?: number;
  }) {
    const { search, organizationId, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where = {
      deletedAt: null,
      ...(organizationId && { organizationId }),
      ...(search && {
        OR: [
          { displayName: { contains: search, mode: 'insensitive' as const } },
          { id: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prismaService.tenantTool.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          displayName: true,
          status: true,
          isConnected: true,
          createdAt: true,
          organization: { select: { id: true, name: true, slug: true } },
          toolCatalog: {
            select: { id: true, toolName: true, displayName: true, provider: true, icon: true },
          },
          _count: { select: { workflows: true } },
        },
      }),
      this.prismaService.tenantTool.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getTenantToolById(id: string): Promise<DashboardTenantToolDto | null> {
    try {
      const tenantTool = await this.prismaService.tenantTool.findUnique({
        where: { id },
        select: {
          id: true,
          displayName: true,
          status: true,
          isConnected: true,
          createdAt: true,
          createdByUserId: true,
          allowedFunctions: true,
          ...HEALTH_SELECT,
        },
      });
      return tenantTool ? this.toDashboardDto(tenantTool) : null;
    } catch (error: any) {
      this.logger.error(
        `Error fetching tenant tool with ID ${id}: ${error?.message ?? 'Unknown error'}`,
      );
      return null;
    }
  }

  async createTenantTool(data: CreateTenantToolDto, organizationId: string, userId: string) {
    try {
      const requestedDisplayName = data.displayName.trim();

      // Fetch tool catalog to check provider
      const catalog = await this.prismaService.toolCatalog.findUnique({
        where: { id: data.toolCatalogId },
        select: { provider: true },
      });

      if (!catalog) {
        throw new NotFoundException('Tool catalog entry not found');
      }

      // Only ACTIVE tools (deletedAt = null) block name reuse.
      const activeToolWithSameName = await this.prismaService.tenantTool.findFirst({
        where: {
          organizationId,
          displayName: requestedDisplayName,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (activeToolWithSameName) {
        throw new ConflictException('Ya existe una herramienta activa con ese nombre.');
      }

      // Determine if it should be connected immediately
      // If provider is 'none', 'custom' or empty, it doesn't need OAuth
      const noAuthRequired =
        !catalog.provider ||
        catalog.provider.toLowerCase() === 'none' ||
        catalog.provider.toLowerCase() === 'custom';

      const tenantTool = await this.prismaService.tenantTool.create({
        data: {
          displayName: requestedDisplayName,
          organizationId,
          toolCatalogId: data.toolCatalogId,
          allowedFunctions: data.allowedFunctions,
          config: data.config,
          createdByUserId: userId,
          isConnected: noAuthRequired,
          status: noAuthRequired
            ? ToolConnectionStatus.CONNECTED
            : ToolConnectionStatus.DISCONNECTED,
          workflows: {
            connect: data.workflowId ? [{ id: data.workflowId }] : [],
          },
        },
      });
      return tenantTool;
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException('Ya existe una herramienta activa con ese nombre.');
      }

      this.logger.error(`Error creating tenant tool: ${error?.message ?? 'Unknown error'}`);
      throw error;
    }
  }

  async updateTenantTool(
    id: string,
    orgId: string,
    userId: string,
    role: string,
    data: UpdateTenantToolDto,
  ) {
    const tool = await this.prismaService.tenantTool.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!tool) {
      throw new NotFoundException('Tool not found');
    }

    if (tool.createdByUserId && tool.createdByUserId !== userId && role !== UserRole.OWNER) {
      throw new ForbiddenException('No tienes permisos para modificar esta herramienta');
    }

    try {
      return await this.prismaService.tenantTool.update({
        where: { id },
        data: {
          displayName: data.displayName,
        },
      });
    } catch (error: any) {
      this.logger.error(
        `Error updating tenant tool with ID ${id}: ${error?.message ?? 'Unknown error'}`,
      );
      return null;
    }
  }

  async addWorkflowToTenantTool(
    tenantToolId: string,
    orgId: string,
    userId: string,
    role: string,
    workflowIds: string[],
  ) {
    const tool = await this.prismaService.tenantTool.findFirst({
      where: { id: tenantToolId, organizationId: orgId },
    });

    if (!tool) {
      throw new NotFoundException('Tool not found');
    }

    if (tool.createdByUserId && tool.createdByUserId !== userId && role !== UserRole.OWNER) {
      throw new ForbiddenException('No tienes permisos para modificar esta herramienta');
    }

    try {
      return await this.prismaService.tenantTool.update({
        where: { id: tenantToolId },
        data: {
          workflows: {
            connect: workflowIds.map((id) => ({ id })),
          },
        },
      });
    } catch (error: any) {
      this.logger.error(
        `Error adding workflows to tenant tool with ID ${tenantToolId}: ${error?.message ?? 'Unknown error'}`,
      );
      return null;
    }
  }

  async removeWorkflowFromTenantTool(
    tenantToolId: string,
    orgId: string,
    userId: string,
    role: string,
    workflowIds: string[],
  ) {
    const tool = await this.prismaService.tenantTool.findFirst({
      where: { id: tenantToolId, organizationId: orgId },
    });

    if (!tool) {
      throw new NotFoundException('Tool not found');
    }

    if (tool.createdByUserId && tool.createdByUserId !== userId && role !== UserRole.OWNER) {
      throw new ForbiddenException('No tienes permisos para modificar esta herramienta');
    }

    try {
      return await this.prismaService.tenantTool.update({
        where: { id: tenantToolId },
        data: {
          workflows: {
            disconnect: workflowIds.map((id) => ({ id })),
          },
        },
      });
    } catch (error: any) {
      this.logger.error(
        `Error removing workflows from tenant tool with ID ${tenantToolId}: ${error?.message ?? 'Unknown error'}`,
      );
      return null;
    }
  }

  /**
   * Estado del catálogo de "WhatsApp Outbound" para una organización: si hay al menos un
   * número configurado (para pintar la tarjeta activa o gris) y qué workflows ya tienen un
   * WhatsAppConfig activo con `defaultWorkflowId` propio pero todavía no están enganchados
   * a la tenant tool (para ofrecer el enlace en el diálogo de selección).
   */
  async getWhatsappOutboundStatus(organizationId: string): Promise<WhatsappOutboundStatusDto> {
    const [whatsappConfigCount, tenantTool, configsWithDefaultWorkflow] = await Promise.all([
      this.prismaService.whatsAppConfig.count({
        where: { organizationId, deletedAt: null },
      }),
      this.prismaService.tenantTool.findFirst({
        where: {
          organizationId,
          deletedAt: null,
          toolCatalog: { toolName: 'send_bulk_whatsapp' },
        },
        select: { id: true, config: true, workflows: { select: { id: true } } },
      }),
      this.prismaService.whatsAppConfig.findMany({
        where: {
          organizationId,
          deletedAt: null,
          isActive: true,
          defaultWorkflowId: { not: null },
        },
        select: {
          id: true,
          phoneNumber: true,
          displayName: true,
          defaultWorkflowId: true,
          defaultWorkflow: { select: { id: true, name: true } },
        },
      }),
    ]);

    const linkedWorkflowIds = new Set(tenantTool?.workflows.map((w) => w.id) ?? []);
    const defaultByWorkflow = this.readDefaultByWorkflow(tenantTool?.config);

    const byWorkflowId = new Map<string, WhatsappOutboundStatusDto['unlinkedWorkflows'][number]>();
    const linkedByWorkflowId = new Map<
      string,
      WhatsappOutboundStatusDto['linkedWorkflowsNeedingDefault'][number]
    >();

    for (const wac of configsWithDefaultWorkflow) {
      const workflowId = wac.defaultWorkflowId;
      if (!workflowId) continue;

      const number = {
        whatsappConfigId: wac.id,
        phoneNumber: wac.phoneNumber,
        displayName: wac.displayName,
      };

      if (linkedWorkflowIds.has(workflowId)) {
        const entry = linkedByWorkflowId.get(workflowId) ?? {
          workflowId,
          workflowName: wac.defaultWorkflow?.name ?? '',
          whatsappNumbers: [],
          defaultWhatsappConfigId: null,
        };
        entry.whatsappNumbers.push(number);
        linkedByWorkflowId.set(workflowId, entry);
      } else {
        const entry = byWorkflowId.get(workflowId) ?? {
          workflowId,
          workflowName: wac.defaultWorkflow?.name ?? '',
          whatsappNumbers: [],
        };
        entry.whatsappNumbers.push(number);
        byWorkflowId.set(workflowId, entry);
      }
    }

    // Solo interesan los workflows enlazados con MÁS de un número: con uno solo no hay nada
    // que elegir, y mostrarlo en la UI sería un selector con una opción fija.
    const linkedWorkflowsNeedingDefault = Array.from(linkedByWorkflowId.values())
      .filter((entry) => entry.whatsappNumbers.length > 1)
      .map((entry) => {
        const configuredIds = new Set(entry.whatsappNumbers.map((n) => n.whatsappConfigId));
        const preferred = defaultByWorkflow[entry.workflowId];
        return {
          ...entry,
          defaultWhatsappConfigId: preferred && configuredIds.has(preferred) ? preferred : null,
        };
      });

    return {
      hasWhatsappConfig: whatsappConfigCount > 0,
      tenantToolId: tenantTool?.id ?? null,
      unlinkedWorkflows: Array.from(byWorkflowId.values()),
      linkedWorkflowsNeedingDefault,
    };
  }

  /** `TenantTool.config.default_by_workflow`, tolerante a que no exista o venga mal formado. */
  private readDefaultByWorkflow(config: Prisma.JsonValue | undefined): Record<string, string> {
    const raw = (config as Record<string, unknown> | null | undefined)?.default_by_workflow;
    if (!raw || typeof raw !== 'object') return {};
    return raw as Record<string, string>;
  }

  /**
   * Engancha los workflows seleccionados a la tenant tool "WhatsApp Outbound" de la
   * organización, creándola si todavía no existe. Sin gate de `createdByUserId`: a
   * diferencia de editar una tool ya conectada, esto es un flujo de setup guiado que
   * cualquier OWNER/ADMIN puede completar (el controller ya restringe el rol).
   */
  async linkWhatsappOutboundWorkflows(
    organizationId: string,
    userId: string,
    workflowIds: string[],
  ) {
    if (workflowIds.length === 0) {
      throw new NotFoundException('No workflow IDs provided');
    }

    const validWorkflows = await this.prismaService.workflow.findMany({
      where: { id: { in: workflowIds }, organizationId },
      select: { id: true },
    });

    if (validWorkflows.length !== workflowIds.length) {
      throw new NotFoundException('One or more workflows do not belong to this organization');
    }

    const catalogEntry = await this.prismaService.toolCatalog.findFirst({
      where: { toolName: 'send_bulk_whatsapp' },
      select: { id: true, displayName: true },
    });

    if (!catalogEntry) {
      throw new NotFoundException('WhatsApp Outbound tool catalog entry not found');
    }

    const existing = await this.prismaService.tenantTool.findFirst({
      where: { organizationId, deletedAt: null, toolCatalogId: catalogEntry.id },
    });

    try {
      if (existing) {
        return await this.prismaService.tenantTool.update({
          where: { id: existing.id },
          data: {
            workflows: { connect: workflowIds.map((id) => ({ id })) },
          },
        });
      }

      const linkedConfigs = await this.prismaService.whatsAppConfig.findMany({
        where: {
          organizationId,
          deletedAt: null,
          isActive: true,
          defaultWorkflowId: { in: workflowIds },
        },
        select: { id: true },
      });
      const configIds = linkedConfigs.map((c) => c.id);
      const config =
        configIds.length > 1
          ? { whatsapp_config_id: configIds }
          : configIds.length === 1
            ? { whatsapp_config_id: configIds[0] }
            : undefined;

      return await this.prismaService.tenantTool.create({
        data: {
          displayName: catalogEntry.displayName,
          organizationId,
          toolCatalogId: catalogEntry.id,
          allowedFunctions: ['send_bulk_whatsapp'],
          config,
          createdByUserId: userId,
          connectedAt: new Date(),
          isConnected: true,
          status: ToolConnectionStatus.CONNECTED,
          workflows: { connect: workflowIds.map((id) => ({ id })) },
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException('Ya existe una herramienta activa con ese nombre.');
      }
      this.logger.error(
        `Error linking workflows to WhatsApp Outbound tenant tool: ${error?.message ?? 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Fija (o borra) cuál de los números conectados usa `send_bulk_whatsapp` como remitente para
   * este workflow cuando la conversación no es por WhatsApp — API/Messenger no traen un número
   * de destino que lo desambigüe solo, a diferencia del webhook de WhatsApp (ver el comentario en
   * `WorkflowsService` donde se arma el payload de la tool). No afecta a los mensajes que sí son
   * de WhatsApp: ahí siempre gana el número por el que llegó la conversación.
   *
   * `whatsappConfigId: null` borra la preferencia (vuelve a caer en el primero de la lista).
   */
  async setWhatsappOutboundDefault(
    organizationId: string,
    workflowId: string,
    whatsappConfigId: string | null,
  ): Promise<void> {
    const catalogEntry = await this.prismaService.toolCatalog.findFirst({
      where: { toolName: 'send_bulk_whatsapp' },
      select: { id: true },
    });
    if (!catalogEntry) {
      throw new NotFoundException('WhatsApp Outbound tool catalog entry not found');
    }

    const tenantTool = await this.prismaService.tenantTool.findFirst({
      where: {
        organizationId,
        deletedAt: null,
        toolCatalogId: catalogEntry.id,
        workflows: { some: { id: workflowId } },
      },
      select: { id: true, config: true },
    });
    if (!tenantTool) {
      throw new NotFoundException(
        'Este workflow no está conectado a la tool de WhatsApp Outbound',
      );
    }

    if (whatsappConfigId) {
      const belongsToWorkflow = await this.prismaService.whatsAppConfig.findFirst({
        where: {
          id: whatsappConfigId,
          organizationId,
          deletedAt: null,
          isActive: true,
          defaultWorkflowId: workflowId,
        },
        select: { id: true },
      });
      if (!belongsToWorkflow) {
        throw new NotFoundException(
          'Ese número no está conectado a este workflow',
        );
      }
    }

    const defaultByWorkflow = this.readDefaultByWorkflow(tenantTool.config);
    if (whatsappConfigId) {
      defaultByWorkflow[workflowId] = whatsappConfigId;
    } else {
      delete defaultByWorkflow[workflowId];
    }

    await this.prismaService.tenantTool.update({
      where: { id: tenantTool.id },
      data: {
        config: {
          ...(tenantTool.config as Record<string, unknown> | null),
          default_by_workflow: defaultByWorkflow,
        },
      },
    });
  }

  /**
   * Executes a strict Hard-Delete on the OAuth credentials and a Soft-Delete on the tool instance.
   */
  async deleteTool(tenantToolId: string, orgId: string, userId: string, role: string) {
    const tool = await this.prismaService.tenantTool.findFirst({
      where: { id: tenantToolId, organizationId: orgId },
    });

    if (!tool) {
      throw new NotFoundException('Tool not found');
    }

    if (tool.createdByUserId && tool.createdByUserId !== userId && role !== UserRole.OWNER) {
      throw new Error('No tienes permisos para desconectar esta herramienta');
    }

    await this.prismaService.$transaction(async (tx) => {
      // HARD DELETE of PII Secrets Bóveda
      await tx.tenantToolCredential.deleteMany({
        where: { tenantToolId },
      });

      // Desconectar de todos los workflows para que no aparezca en la UI
      await tx.tenantTool.update({
        where: { id: tenantToolId },
        data: {
          workflows: { set: [] },
        },
      });

      // SOFT DELETE of shell (to keep execution history) y status update
      await tx.tenantTool.update({
        where: { id: tenantToolId },
        data: {
          status: ToolConnectionStatus.DISCONNECTED,
          isConnected: false,
          deletedAt: new Date(),
        },
      });
    });
  }

  /**
   * Wipes sensitive credentials and configuration data, resetting the tool to a
   * 'pending' state. This allows for reconnection while ensuring no PII persists.
   */
  async disconnectTool(tenantToolId: string, orgId: string, userId: string, role: string) {
    const tool = await this.prismaService.tenantTool.findFirst({
      where: { id: tenantToolId, organizationId: orgId },
    });

    if (!tool) {
      throw new NotFoundException('Tool not found');
    }

    if (tool.createdByUserId && tool.createdByUserId !== userId && role !== UserRole.OWNER) {
      throw new Error('No tienes permisos para desconectar esta herramienta');
    }

    await this.prismaService.$transaction(async (tx) => {
      // HARD DELETE of PII Secrets Bóveda
      await tx.tenantToolCredential.deleteMany({
        where: { tenantToolId },
      });

      // SOFT DELETE of shell (to keep execution history) y status update
      await tx.tenantTool.update({
        where: { id: tenantToolId },
        data: {
          status: ToolConnectionStatus.DISCONNECTED,
          isConnected: false,
          config: Prisma.DbNull,
        },
      });
    });
  }
}
