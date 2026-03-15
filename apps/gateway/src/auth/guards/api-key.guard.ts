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
 * 2. Busca API Key directamente por su hash (O(1))
 * 3. Valida que la organización esté activa
 * 4. Inyecta el ApiKeyPayload en el request
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
      // Hashear el API Key recibida (SHA-256 es determinista)
      const keyHash = ApiKeyUtil.hash(apiKey);

      // Buscar API Key directamente por su hash (O(1))
      const matchedApiKey = await this.prisma.apiKey.findUnique({
        where: {
          keyHash: keyHash,
        },
        select: {
          id: true,
          name: true,
          isActive: true,
          deletedAt: true,
          workflowId: true,
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

      if (!matchedApiKey || !matchedApiKey.isActive || matchedApiKey.deletedAt) {
        this.logger.warn(`API key inválido, inactivo o eliminado`);
        throw new UnauthorizedException('API key inválido');
      }

      // Validar la organización
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

      // Actualizar lastUsedAt del API Key
      this.prisma.apiKey
        .update({
          where: { id: matchedApiKey.id },
          data: { lastUsedAt: new Date() },
        })
        .catch((err: Error) => {
          // No fallar si esto falla, solo loggear
          this.logger.warn('Error actualizando lastUsedAt', err);
        });

      // Preparar el payload del API Key
      const apiKeyPayload: ApiKeyPayload = {
        apiKeyId: matchedApiKey.id,
        apiKeyName: matchedApiKey.name,
        organizationId: organization.id,
        organizationName: organization.name,
        plan: organization.plan,
        workflowId: matchedApiKey.workflowId,
      };

      // Inyectar en el request
      Object.assign(request, { apiKey: apiKeyPayload });

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
