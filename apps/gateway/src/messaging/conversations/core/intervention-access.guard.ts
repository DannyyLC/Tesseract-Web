import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { InterventionTokenClaims, InterventionTokenService } from './intervention-token.service';

/**
 * Protege el endpoint interno que activa human-in-the-loop desde un nodo del workflow.
 *
 * El alcance sale del token, nunca del body: quien llama no puede indicar a qué conversación
 * intervenir por fuera de lo que el token ya nombra. Mismo principio que `DatasetAccessGuard`.
 */
export interface InterventionRequest extends Request {
  interventionClaims?: InterventionTokenClaims;
}

@Injectable()
export class InterventionAccessGuard implements CanActivate {
  constructor(private readonly interventionTokenService: InterventionTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<InterventionRequest>();
    const header = request.headers.authorization ?? '';

    if (!header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Falta el token de intervención');
    }

    request.interventionClaims = this.interventionTokenService.verify(
      header.slice('Bearer '.length),
    );

    return true;
  }
}
