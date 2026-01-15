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
import { PLANS, SubscriptionPlan } from '@workflow-automation/shared-types';

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) { }

  /**
   * Crea un nuevo API Key para una organización
   * Retorna el API Key en texto plano (ÚNICA VEZ)
   */
  async create(organizationId: string, dto: CreateApiKeyDto) {
    // 1. Verificar que la organización existe y obtener límite de API Keys
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

    // 2. Verificar límite de API Keys según el plan
    const planConfig = PLANS[organization.plan as SubscriptionPlan];
    const maxApiKeys = planConfig.limits.maxApiKeys;

    // -1 significa ilimitado
    if (maxApiKeys !== -1 && organization._count.apiKeys >= maxApiKeys) {
      throw new BadRequestException(
        `Has alcanzado el límite de ${maxApiKeys} API Keys para tu plan ${organization.plan}. ` +
        `Elimina una API Key existente o actualiza tu plan.`,
      );
    }

    // 3. Generar API Key aleatorio
    const apiKey = ApiKeyUtil.generate('live');

    // 4. Extraer prefijo para búsqueda rápida
    const keyPrefix = ApiKeyUtil.extractPrefix(apiKey);

    // 5. Hashear el API Key con bcrypt
    const keyHash = await ApiKeyUtil.hash(apiKey);

    // 6. Guardar en la base de datos
    const created = await this.prisma.apiKey.create({
      data: {
        name: dto.name,
        description: dto.description,
        keyHash,
        keyPrefix,
        organizationId,
        workflowId: dto.workflowId,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        isActive: true,
      },
    });

    // 7. Retornar con el API Key en texto plano (SOLO ESTA VEZ)
    return {
      id: created.id,
      name: created.name,
      description: created.description,
      apiKey, // Este es el valor completo, solo se muestra aquí
      keyPrefix: created.keyPrefix,
      isActive: created.isActive,
      workflowId: created.workflowId,
      expiresAt: created.expiresAt,
      createdAt: created.createdAt,
    };
  }

  /**
   * Lista todos los API Keys de una organización
   * NO incluye el valor completo del API Key (solo el prefijo)
   */
  async findAll(organizationId: string) {
    const keys = await this.prisma.apiKey.findMany({
      where: {
        organizationId,
        deletedAt: null, // Solo mostrar API Keys no eliminados
      },
      orderBy: { createdAt: 'desc' },
    });

    // Mapear para NO exponer el hash ni el API Key completo
    return keys.map((key: any) => ({
      id: key.id,
      name: key.name,
      description: key.description,
      keyPrefix: key.keyPrefix, // Solo muestra "ak_live_ab..."
      isActive: key.isActive,
      lastUsedAt: key.lastUsedAt,
      expiresAt: key.expiresAt,
      workflowId: key.workflowId,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
    }));
  }

  /**
   * Elimina un API Key (soft delete)
   * Marca deletedAt y desactiva el API Key
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
   * Actualiza un API Key (nombre, descripción y/o estado activo)
   */
  async update(organizationId: string, apiKeyId: string, dto: UpdateApiKeyDto) {
    // 1. Buscar el API Key
    const key = await this.prisma.apiKey.findUnique({
      where: { id: apiKeyId },
    });

    if (!key) {
      throw new NotFoundException('API Key no encontrada');
    }

    // 2. Verificar que pertenece a la organización (seguridad)
    if (key.organizationId !== organizationId) {
      throw new ForbiddenException('No tienes permiso para modificar esta API Key');
    }

    // 3. Verificar que no esté eliminada
    if (key.deletedAt) {
      throw new ForbiddenException('No puedes modificar una API Key eliminada');
    }

    // 4. Preparar datos a actualizar (solo los campos proporcionados)
    const dataToUpdate: any = {};
    if (dto.name !== undefined) {
      dataToUpdate.name = dto.name;
    }
    if (dto.description !== undefined) {
      dataToUpdate.description = dto.description;
    }
    if (dto.isActive !== undefined) {
      dataToUpdate.isActive = dto.isActive;
    }

    // 5. Si no hay nada que actualizar, retornar error
    if (Object.keys(dataToUpdate).length === 0) {
      throw new BadRequestException('No se proporcionaron campos para actualizar');
    }

    // 6. Actualizar en la base de datos
    const updated = await this.prisma.apiKey.update({
      where: { id: apiKeyId },
      data: dataToUpdate,
    });

    return {
      success: true,
      apiKey: {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        keyPrefix: updated.keyPrefix,
        isActive: updated.isActive,
        lastUsedAt: updated.lastUsedAt,
        expiresAt: updated.expiresAt,
        workflowId: updated.workflowId,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
      message: 'API Key actualizada exitosamente',
    };
  }

  /**
   * Obtiene un API Key específico (sin exponer el valor completo)
   */
  async findOne(organizationId: string, apiKeyId: string) {
    const key = await this.prisma.apiKey.findUnique({
      where: { id: apiKeyId },
    });

    if (!key) {
      throw new NotFoundException('API Key no encontrada');
    }

    if (key.organizationId !== organizationId) {
      throw new ForbiddenException('No tienes permiso para ver esta API Key');
    }

    // No exponer el hash ni el API Key completo
    return {
      id: key.id,
      name: key.name,
      description: key.description,
      keyPrefix: key.keyPrefix,
      isActive: key.isActive,
      lastUsedAt: key.lastUsedAt,
      expiresAt: key.expiresAt,
      workflowId: key.workflowId,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
      deletedAt: key.deletedAt,
    };
  }
}
