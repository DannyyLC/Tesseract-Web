import { Injectable, NotFoundException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from '../database/prisma.service';
import { ApiKeyUtil } from "../auth/utils/api-key.util";
import { CreateApiKeyDto } from "./dto/create-api-key.dto";
import { UpdateApiKeyDto } from "./dto/update-api-key.dto";

@Injectable()
export class  ApiKeysService {
    constructor(private readonly prisma: PrismaService) {}

    /**
     * Crea un nuevo API Key para un cliente
     * Retorna el API Key en texto plano (ÚNICA VEZ)
     */
    async create(clientId: string, dto: CreateApiKeyDto) {
        // 1. Verificar que el cliente existe y obtener límite de API Keys
        const client = await this.prisma.client.findUnique({
            where: { id: clientId },
            include: { 
                _count: { 
                    select: { apiKeys: true } 
                } 
            },
        });

        if (!client) {
            throw new NotFoundException('Cliente no encontrado');
        }

        // 2. Verificar límite de API Keys según el plan
        if (client._count.apiKeys >= client.maxApiKeys) {
            throw new ForbiddenException(
                `Has alcanzado el límite de ${client.maxApiKeys} API Keys para tu plan ${client.plan}. ` +
                `Elimina una API Key existente o actualiza tu plan.`
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
                keyHash,
                keyPrefix,
                clientId,
                scopes: dto.scopes ?? undefined, // Usar undefined en lugar de null para JSON
                expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
                isActive: true,
            },
        });

        // 7. Retornar con el API Key en texto plano (SOLO ESTA VEZ)
        return {
            id: created.id,
            name: created.name,
            apiKey, // ⚠️ Este es el valor completo, solo se muestra aquí
            keyPrefix: created.keyPrefix,
            isActive: created.isActive,
            scopes: created.scopes,
            expiresAt: created.expiresAt,
            createdAt: created.createdAt,
        };
    }

    /**
     * Lista todos los API Keys de un cliente
     * NO incluye el valor completo del API Key (solo el prefijo)
     */
    async findAll(clientId: string) {
        const keys = await this.prisma.apiKey.findMany({
            where: { 
                clientId, 
                deletedAt: null // Solo mostrar API Keys no eliminados
            },
            orderBy: { createdAt: 'desc' },
        });

        // Mapear para NO exponer el hash ni el API Key completo
        return keys.map(key => ({
            id: key.id,
            name: key.name,
            keyPrefix: key.keyPrefix, // Solo muestra "ak_live_ab..."
            isActive: key.isActive,
            lastUsedAt: key.lastUsedAt,
            expiresAt: key.expiresAt,
            createdAt: key.createdAt,
            updatedAt: key.updatedAt,
        }));
    }

    /**
     * Elimina un API Key (soft delete)
     * Marca deletedAt y desactiva el API Key
     */
    async delete(clientId: string, apiKeyId: string) {
        // 1. Buscar el API Key
        const key = await this.prisma.apiKey.findUnique({ 
            where: { id: apiKeyId } 
        });

        if (!key) {
            throw new NotFoundException('API Key no encontrada');
        }

        // 2. Verificar que pertenece al cliente (seguridad)
        if (key.clientId !== clientId) {
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
                isActive: false 
            } 
        });

        return { 
            success: true,
            message: 'API Key eliminada exitosamente'
        };
    }

    /**
     * Activa o desactiva un API Key
     * Alterna el estado isActive
     */
    async toggleActive(clientId: string, apiKeyId: string) {
        // 1. Buscar el API Key
        const key = await this.prisma.apiKey.findUnique({ 
            where: { id: apiKeyId } 
        });

        if (!key) {
            throw new NotFoundException('API Key no encontrada');
        }

        // 2. Verificar que pertenece al cliente (seguridad)
        if (key.clientId !== clientId) {
            throw new ForbiddenException('No tienes permiso para modificar esta API Key');
        }

        // 3. Verificar que no esté eliminada
        if (key.deletedAt) {
            throw new ForbiddenException('No puedes modificar una API Key eliminada');
        }

        // 4. Alternar el estado isActive
        const newState = !key.isActive;
        await this.prisma.apiKey.update({ 
            where: { id: apiKeyId }, 
            data: { isActive: newState } 
        });

        return { 
            success: true,
            isActive: newState,
            message: `API Key ${newState ? 'activada' : 'desactivada'} exitosamente`
        };
    }

    /**
     * Actualiza un API Key (nombre y/o estado activo)
     * Permite cambiar el nombre y/o el estado isActive de forma independiente
     */
    async update(clientId: string, apiKeyId: string, dto: UpdateApiKeyDto) {
        // 1. Buscar el API Key
        const key = await this.prisma.apiKey.findUnique({ 
            where: { id: apiKeyId } 
        });

        if (!key) {
            throw new NotFoundException('API Key no encontrada');
        }

        // 2. Verificar que pertenece al cliente (seguridad)
        if (key.clientId !== clientId) {
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
        if (dto.isActive !== undefined) {
            dataToUpdate.isActive = dto.isActive;
        }

        // 5. Si no hay nada que actualizar, retornar error
        if (Object.keys(dataToUpdate).length === 0) {
            throw new ForbiddenException('No se proporcionaron campos para actualizar');
        }

        // 6. Actualizar en la base de datos
        const updated = await this.prisma.apiKey.update({ 
            where: { id: apiKeyId }, 
            data: dataToUpdate
        });

        return { 
            success: true,
            apiKey: {
                id: updated.id,
                name: updated.name,
                keyPrefix: updated.keyPrefix,
                isActive: updated.isActive,
                lastUsedAt: updated.lastUsedAt,
                expiresAt: updated.expiresAt,
                createdAt: updated.createdAt,
                updatedAt: updated.updatedAt,
            },
            message: 'API Key actualizada exitosamente'
        };
    }

    /**
     * Obtiene un API Key específico (sin exponer el valor completo)
     */
    async findOne(clientId: string, apiKeyId: string) {
        const key = await this.prisma.apiKey.findUnique({
            where: { id: apiKeyId },
        });

        if (!key) {
            throw new NotFoundException('API Key no encontrada');
        }

        if (key.clientId !== clientId) {
            throw new ForbiddenException('No tienes permiso para ver esta API Key');
        }

        // No exponer el hash ni el API Key completo
        return {
            id: key.id,
            name: key.name,
            keyPrefix: key.keyPrefix,
            isActive: key.isActive,
            lastUsedAt: key.lastUsedAt,
            expiresAt: key.expiresAt,
            scopes: key.scopes,
            createdAt: key.createdAt,
            updatedAt: key.updatedAt,
            deletedAt: key.deletedAt,
        };
    }
}
