import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import type { Request } from 'express';

/**
 * Protege los endpoints que solo debe invocar Cloud Tasks.
 *
 * El servicio de Cloud Run es público —el webhook de YCloud lo exige—, así que
 * estos endpoints son alcanzables desde internet y este guard es lo único que los
 * separa de cualquiera. Valida el token OIDC que Cloud Tasks firma con nuestra
 * service account: se comprueba la firma contra las llaves públicas de Google, que
 * el `audience` sea exactamente la URL invocada y que el emisor sea la cuenta
 * esperada.
 */
@Injectable()
export class CloudTasksOidcGuard implements CanActivate {
  private readonly logger = new Logger(CloudTasksOidcGuard.name);
  private readonly oauthClient = new OAuth2Client();

  private readonly serviceAccountEmail: string;
  private readonly workerBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.serviceAccountEmail = this.configService.get<string>('GCP_TASKS_SERVICE_ACCOUNT', '');
    this.workerBaseUrl = this.configService
      .get<string>('GCP_TASKS_WORKER_BASE_URL', '')
      .replace(/\/$/, '');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization ?? '';

    if (!header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Falta el token OIDC de Cloud Tasks');
    }

    if (!this.serviceAccountEmail || !this.workerBaseUrl) {
      // Fallar cerrado: sin configuración no hay forma de validar nada, y dejar
      // pasar la request expondría el worker a internet.
      this.logger.error(
        'CloudTasksOidcGuard sin configurar (GCP_TASKS_SERVICE_ACCOUNT / GCP_TASKS_WORKER_BASE_URL)',
      );
      throw new UnauthorizedException('Validación OIDC no disponible');
    }

    const audience = `${this.workerBaseUrl}${request.originalUrl.split('?')[0]}`;

    try {
      const ticket = await this.oauthClient.verifyIdToken({
        idToken: header.slice('Bearer '.length),
        audience,
      });

      const payload = ticket.getPayload();
      if (payload?.email !== this.serviceAccountEmail || payload?.email_verified !== true) {
        throw new UnauthorizedException('El token OIDC no pertenece a la service account esperada');
      }

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      this.logger.warn(
        `Token OIDC inválido para ${audience}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new UnauthorizedException('Token OIDC inválido');
    }
  }
}
