import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '@/database/prisma.service';
import { ClientPayload} from '../types/client.type';

/**
 * Guard que protege los endpoint validando el header X-API-Key
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor (private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = this.extractApiKey(request);

    if ( !apiKey) {
      this.logger.warn('Peticion sin API key');
      throw new UnauthorizedException('API key requerida');
    }

    try {
      const client = await this.prisma.client.findUnique({
        where: { apiKey},
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
      });

      if (!client) {
        this.logger.warn(`API key invalido:  ${apiKey.substring(0,8)}...`);
        throw new UnauthorizedException('API key inválido');
      }

      if (!client.isActive) {
        this.logger.warn(`Cliente inactivo: ${client.email}`);
        throw new UnauthorizedException('Cuenta desactivada');
      }

      if (client.deletedAt) {
        this.logger.warn(`Cliente eliminado: ${client.email}`);
        throw new UnauthorizedException('Cuenta eliminada');
      }

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