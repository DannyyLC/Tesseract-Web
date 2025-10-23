import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../database/prisma.service';
import { ClientPayload } from '../../common/types/client-payload.type';
import { ApiKeyUtil } from '../utils/api-key.util';

/**
 * Guard que protege los endpoints validando el header X-API-Key
 * 
 * Flujo:
 * 1. Extrae el API Key del header
 * 2. Busca API Keys por prefijo (optimización)
 * 3. Compara con bcrypt cada candidato
 * 4. Valida que el cliente esté activo
 * 5. Inyecta el cliente en el request
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
      const prefix = ApiKeyUtil.extractPrefix(apiKey);

      // 2. Buscar API Keys candidatas por prefijo
      const apiKeyCandidates = await this.prisma.apiKey.findMany({
        where: {
          keyPrefix: prefix,
          isActive: true,
          deletedAt: null,
        },
        include: {
          client: {
            select: {
              id: true,
              name: true,
              email: true,
              plan: true,
              maxWorkflows: true,
              maxExecutionsPerDay: true,
              isActive: true,
              region: true,
              metadata: true,
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
        const isMatch = await ApiKeyUtil.compare(apiKey, candidate.keyHash);
        if (isMatch) {
          matchedApiKey = candidate;
          break;
        }
      }

      if (!matchedApiKey) {
        this.logger.warn(`API key inválido: ${prefix}...`);
        throw new UnauthorizedException('API key inválido');
      }

      // 4. Validar el cliente
      const client = matchedApiKey.client;

      if (!client.isActive) {
        this.logger.warn(`Cliente inactivo: ${client.email}`);
        throw new UnauthorizedException('Cuenta inactiva');
      }

      if (client.deletedAt) {
        this.logger.warn(`Cliente eliminado: ${client.email}`);
        throw new UnauthorizedException('Cuenta eliminada');
      }

      // 5. Actualizar lastUsedAt del API Key (opcional pero recomendado)
      this.prisma.apiKey
        .update({
          where: { id: matchedApiKey.id },
          data: { lastUsedAt: new Date() },
        })
        .catch((err: Error) => {
          // No fallar si esto falla, solo loggear
          this.logger.warn('Error actualizando lastUsedAt', err);
        });

      // 6. Preparar el payload del cliente
      const clientPayload: ClientPayload = {
        id: client.id,
        name: client.name,
        email: client.email,
        plan: client.plan,
        maxWorkflows: client.maxWorkflows,
        maxExecutionsPerDay: client.maxExecutionsPerDay,
        isActive: client.isActive,
        region: client.region,
        metadata: client.metadata,
      };

      // 7. Inyectar en el request
      (request as any).client = clientPayload;

      this.logger.debug(`Cliente autenticado: ${client.email}`);

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
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7); // Quitar "Bearer "
    }

    return undefined;
  }
}