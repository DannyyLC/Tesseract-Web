import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../database/prisma.service';
import { ApiKeyPayload } from '../../common/types/api-key-payload.type';
import { ApiKeyUtil } from '../utils/api-key.util';

/**
 * Guard que protege los endpoints validando el header X-API-Key
 * Sistema multi-tenant con Organization
 *
 * Flujo:
 * 1. Extrae el API Key del header
 * 2. Busca API Keys por prefijo (optimización)
 * 3. Compara con bcrypt cada candidato
 * 4. Valida que la organización esté activa
 * 5. Inyecta el ApiKeyPayload en el request
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = this.extractApiKey(request);

    if (!apiKey) {
      this.logger.warn('Petición sin API key');
      throw new UnauthorizedException('API key requerida');
    }

    try {
      // 1. Extraer prefijo para búsqueda rápida
      const prefix = apiKey.substring(0, 16);

      // 2. Buscar API Keys candidatas por prefijo
      const apiKeyCandidates = await this.prisma.apiKey.findMany({
        where: {
          keyPrefix: prefix,
          isActive: true,
          deletedAt: null,
        },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
              plan: true,
              isActive: true,
              deletedAt: true,
            },
          },
        },
      });

      if (apiKeyCandidates.length === 0) {
        this.logger.warn(`API key inválido: ${prefix}...`);
        throw new UnauthorizedException('API key inválido');
      }

      // 3. Comparar con bcrypt cada candidato
      let matchedApiKey = null;
      for (const candidate of apiKeyCandidates) {
        this.logger.debug(`Comparando API Key recibida con candidato ID: ${candidate.id}`);
        const isMatch = await ApiKeyUtil.compare(apiKey, candidate.keyHash);
        this.logger.debug(`Resultado de comparación: ${isMatch}`);
        if (isMatch) {
          matchedApiKey = candidate;
          break;
        }
      }

      if (!matchedApiKey) {
        this.logger.warn(`API key inválido: ${prefix}...`);
        this.logger.debug(`Candidatos encontrados: ${apiKeyCandidates.length}`);
        this.logger.debug(`API Key recibida (primeros 20 chars): ${apiKey.substring(0, 20)}...`);
        throw new UnauthorizedException('API key inválido');
      }

      // 4. Validar la organización
      const organization = matchedApiKey.organization;

      if (!organization) {
        this.logger.warn(`API Key sin organización: ${matchedApiKey.id}`);
        throw new UnauthorizedException('API key sin organización');
      }

      if (!organization.isActive) {
        this.logger.warn(`Organización inactiva: ${organization.name}`);
        throw new UnauthorizedException('Organización inactiva');
      }

      if (organization.deletedAt) {
        this.logger.warn(`Organización eliminada: ${organization.name}`);
        throw new UnauthorizedException('Organización eliminada');
      }

      // 5. Actualizar lastUsedAt del API Key
      this.prisma.apiKey
        .update({
          where: { id: matchedApiKey.id },
          data: { lastUsedAt: new Date() },
        })
        .catch((err: Error) => {
          // No fallar si esto falla, solo loggear
          this.logger.warn('Error actualizando lastUsedAt', err);
        });

      // 6. Preparar el payload del API Key
      const apiKeyPayload: ApiKeyPayload = {
        apiKeyId: matchedApiKey.id,
        apiKeyName: matchedApiKey.name,
        organizationId: organization.id,
        organizationName: organization.name,
        plan: organization.plan,
        scopes: matchedApiKey.scopes as string[] | undefined,
      };

      // 7. Inyectar en el request
      (request as any).apiKey = apiKeyPayload;

      this.logger.debug(`API Key autenticada: ${matchedApiKey.name} (${organization.name})`);

      return true;
    } catch (error) {
      // Manejo de errores
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      this.logger.error('Error en autenticación', error);
      throw new UnauthorizedException('Error al validar API key');
    }
  }

  /**
   * Extrae el API key del header X-API-Key o Authorization Bearer
   */
  private extractApiKey(request: Request): string | undefined {
    // Opción 1: Header X-API-Key
    const apiKeyHeader = request.headers['x-api-key'] as string;
    if (apiKeyHeader) {
      return apiKeyHeader;
    }

    // Opción 2: Header Authorization Bearer
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7); // Quitar "Bearer "
    }

    return undefined;
  }
}
