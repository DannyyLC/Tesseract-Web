import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ApiKeyGuard } from './api-key.guard';

/**
 * Guard compuesto que acepta CUALQUIERA de:
 * - JWT Token (vía cookies o Authorization header)
 * - API Key (vía X-API-Key header)
 *
 * Útil para endpoints que pueden ser accedidos tanto desde
 * la UI (con JWT) como desde APIs externas (con API Key)
 */
@Injectable()
export class JwtOrApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(JwtOrApiKeyGuard.name);

  constructor(
    private readonly jwtAuthGuard: JwtAuthGuard,
    private readonly apiKeyGuard: ApiKeyGuard,
  ) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Intentar autenticación con API Key primero
    const hasApiKey =
      request.headers?.['x-api-key'] ??
      request.headers?.authorization?.startsWith('Bearer ak_');

    if (hasApiKey) {
      try {
        const result = await this.apiKeyGuard.canActivate(context);
        if (result) {
          this.logger.debug('Autenticado vía API Key');
          return true;
        }
      } catch {
        // Si falla API Key, intentar con JWT
        this.logger.debug('API Key falló, intentando JWT...');
      }
    }

    // Intentar autenticación con JWT
    try {
      const result = await this.jwtAuthGuard.canActivate(context);
      if (result) {
        this.logger.debug('Autenticado vía JWT');
        return true;
      }
    } catch {
      this.logger.debug('JWT falló');
    }

    // Si ninguno funcionó, denegar acceso
    throw new UnauthorizedException(
      'Se requiere autenticación válida (JWT o API Key)',
    );
  }
}
