import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@/platform/database/prisma.service';
import { ApiKeyUtil } from '../auth/utils/api-key.util';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { UpdateApiKeyDto } from './dto/update-api-key.dto';
import { ApiKeyResponseDto, ApiKeyListDto } from './dto/response-api-key.dto';
import { PaginatedResponse, PLANS, SubscriptionPlan } from '@tesseract/types';
import { ApiKey, Prisma } from '@tesseract/database';
import { CursorPaginatedResponseUtils } from '@/platform/common/responses/cursor-paginated-response';

/** El nombre del workflow viaja en el DTO para no obligar al cliente a cruzarlo por su cuenta. */
const WORKFLOW_NAME_INCLUDE = { workflow: { select: { name: true } } } as const;

type ApiKeyWithWorkflowName = ApiKey & { workflow: { name: string } };

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crea un nuevo API Key para una organización
   */
  async create(organizationId: string, dto: CreateApiKeyDto): Promise<ApiKeyResponseDto> {
    // Verificar que la organización existe y obtener límite de API Keys
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        _count: {
          select: { apiKeys: true },
        },
      },
    });

    if (!organization) {
      throw new NotFoundException('Organización no encontrada');
    }

    // Verificar límite de API Keys según el plan
    const planConfig = PLANS[organization.plan as SubscriptionPlan];
    const maxApiKeys = planConfig.limits.maxApiKeys;

    // -1 significa ilimitado
    if (maxApiKeys !== -1 && organization._count.apiKeys >= maxApiKeys) {
      throw new BadRequestException(
        `Has alcanzado el límite de ${maxApiKeys} API Keys para tu plan ${organization.plan}. ` +
          `Elimina una API Key existente o actualiza tu plan.`,
      );
    }

    // Generar API Key aleatorio
    const apiKey = ApiKeyUtil.generate('live');

    // Hashear el API Key con SHA-256
    const keyHash = ApiKeyUtil.hash(apiKey);

    // Guardar en la base de datos
    const created = await this.prisma.apiKey.create({
      data: {
        name: dto.name,
        description: dto.description,
        keyHash,
        organizationId,
        workflowId: dto.workflowId,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        isActive: true,
      },
      include: WORKFLOW_NAME_INCLUDE,
    });

    // Retornar DTO
    return {
      ...this.toListDto(created),
      apiKey,
      updatedAt: created.updatedAt,
    };
  }

  /**
   * Lista los API Keys de una organización, paginados por cursor.
   *
   * `filters.workflowId` es lo que permite reutilizar este listado tanto en la página
   * global de API Keys como en la sección del detalle de un workflow.
   */
  async findAll(
    organizationId: string,
    cursor: string | null = null,
    take = 10,
    paginationAction: 'next' | 'prev' | null = null,
    filters?: { workflowId?: string; search?: string },
  ): Promise<PaginatedResponse<ApiKeyListDto>> {
    const where: Prisma.ApiKeyWhereInput = {
      organizationId,
      deletedAt: null,
      ...(filters?.workflowId && { workflowId: filters.workflowId }),
      ...(filters?.search && {
        name: { contains: filters.search, mode: 'insensitive' as const },
      }),
    };

    const keys = await this.prisma.apiKey.findMany({
      take: paginationAction === 'prev' ? -(take + 1) : take + 1,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      where,
      include: WORKFLOW_NAME_INCLUDE,
      // El desempate por id es lo que hace estable al cursor: sin él, dos keys creadas
      // en el mismo milisegundo pueden repetirse o saltarse entre páginas.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    const paginated = await CursorPaginatedResponseUtils.getInstance().build(
      keys,
      take,
      paginationAction,
    );

    return {
      ...paginated,
      items: paginated.items.map((key) => this.toListDto(key)),
    };
  }

  /**
   * Elimina un API Key (soft delete)
   */
  async delete(organizationId: string, apiKeyId: string) {
    // 1. Buscar el API Key
    const key = await this.prisma.apiKey.findUnique({
      where: { id: apiKeyId },
    });

    if (!key) {
      throw new NotFoundException('API Key no encontrada');
    }

    // 2. Verificar que pertenece a la organización (seguridad)
    if (key.organizationId !== organizationId) {
      throw new ForbiddenException('No tienes permiso para eliminar esta API Key');
    }

    // 3. Verificar que no esté ya eliminada
    if (key.deletedAt) {
      throw new ForbiddenException('Esta API Key ya fue eliminada');
    }

    // 4. Soft delete: marcar como eliminada e inactiva
    await this.prisma.apiKey.update({
      where: { id: apiKeyId },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    return {
      success: true,
      message: 'API Key eliminada exitosamente',
    };
  }

  /**
   * Actualiza un API Key
   */
  async update(
    organizationId: string,
    apiKeyId: string,
    dto: UpdateApiKeyDto,
  ): Promise<ApiKeyListDto> {
    // Buscar el API Key
    const key = await this.prisma.apiKey.findUnique({
      where: { id: apiKeyId },
    });

    if (!key) {
      throw new NotFoundException('API Key no encontrada');
    }

    // Verificar que pertenece a la organización (seguridad)
    if (key.organizationId !== organizationId) {
      throw new ForbiddenException('No tienes permiso para modificar esta API Key');
    }

    // Verificar que no esté eliminada
    if (key.deletedAt) {
      throw new ForbiddenException('No puedes modificar una API Key eliminada');
    }

    // Preparar datos a actualizar
    const dataToUpdate: any = {};
    if (dto.name !== undefined) dataToUpdate.name = dto.name;
    if (dto.description !== undefined) dataToUpdate.description = dto.description;
    if (dto.isActive !== undefined) dataToUpdate.isActive = dto.isActive;

    if (Object.keys(dataToUpdate).length === 0) {
      throw new BadRequestException('No se proporcionaron campos para actualizar');
    }

    const updated = await this.prisma.apiKey.update({
      where: { id: apiKeyId },
      data: dataToUpdate,
      include: WORKFLOW_NAME_INCLUDE,
    });

    return this.toListDto(updated);
  }

  /**
   * Obtiene un API Key específico
   */
  async findOne(organizationId: string, apiKeyId: string): Promise<ApiKeyListDto> {
    const key = await this.prisma.apiKey.findUnique({
      where: { id: apiKeyId },
      include: WORKFLOW_NAME_INCLUDE,
    });

    if (!key) {
      throw new NotFoundException('API Key no encontrada');
    }

    if (key.organizationId !== organizationId) {
      throw new ForbiddenException('No tienes permiso para ver esta API Key');
    }

    return this.toListDto(key);
  }

  /** Mapea la fila de Prisma al DTO público. El `keyHash` nunca sale de aquí. */
  private toListDto(key: ApiKeyWithWorkflowName): ApiKeyListDto {
    return {
      id: key.id,
      name: key.name,
      description: key.description ?? undefined,
      isActive: key.isActive,
      lastUsedAt: key.lastUsedAt ?? undefined,
      expiresAt: key.expiresAt ?? undefined,
      workflowId: key.workflowId,
      workflowName: key.workflow.name,
      createdAt: key.createdAt,
    };
  }
}
