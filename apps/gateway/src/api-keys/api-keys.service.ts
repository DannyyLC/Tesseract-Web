import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ApiKeyUtil } from '../auth/utils/api-key.util';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { UpdateApiKeyDto } from './dto/update-api-key.dto';
import { ApiKeyResponseDto, ApiKeyListDto } from './dto/response-api-key.dto';
import { PLANS, SubscriptionPlan } from '@tesseract/types';

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
    const keyHash = await ApiKeyUtil.hash(apiKey);

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
    });

    // Retornar DTO
    return {
      id: created.id,
      name: created.name,
      description: created.description ?? undefined,
      apiKey,
      isActive: created.isActive,
      workflowId: created.workflowId,
      expiresAt: created.expiresAt ?? undefined,
      lastUsedAt: created.lastUsedAt ?? undefined,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  }

  /**
   * Lista todos los API Keys de una organización
   */
  async findAll(organizationId: string): Promise<ApiKeyListDto[]> {
    const keys = await this.prisma.apiKey.findMany({
      where: {
        organizationId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    return keys.map((key) => ({
      id: key.id,
      name: key.name,
      description: key.description ?? undefined,
      isActive: key.isActive,
      lastUsedAt: key.lastUsedAt ?? undefined,
      expiresAt: key.expiresAt ?? undefined,
      workflowId: key.workflowId,
      createdAt: key.createdAt,
    }));
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
    });

    return {
      id: updated.id,
      name: updated.name,
      description: updated.description ?? undefined,
      isActive: updated.isActive,
      lastUsedAt: updated.lastUsedAt ?? undefined,
      expiresAt: updated.expiresAt ?? undefined,
      workflowId: updated.workflowId,
      createdAt: updated.createdAt,
    };
  }

  /**
   * Obtiene un API Key específico
   */
  async findOne(organizationId: string, apiKeyId: string): Promise<ApiKeyListDto> {
    const key = await this.prisma.apiKey.findUnique({
      where: { id: apiKeyId },
    });

    if (!key) {
      throw new NotFoundException('API Key no encontrada');
    }

    if (key.organizationId !== organizationId) {
      throw new ForbiddenException('No tienes permiso para ver esta API Key');
    }

    return {
      id: key.id,
      name: key.name,
      description: key.description ?? undefined,
      isActive: key.isActive,
      lastUsedAt: key.lastUsedAt ?? undefined,
      expiresAt: key.expiresAt ?? undefined,
      workflowId: key.workflowId,
      createdAt: key.createdAt,
    };
  }
}
