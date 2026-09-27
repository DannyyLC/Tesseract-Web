import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { DatasetTokenClaims, DatasetTokenService } from './dataset-token.service';

/**
 * Protege los endpoints que consulta la tool del agente.
 *
 * El alcance sale del token, nunca de la URL: el endpoint no recibe un `datasetId` por parámetro
 * que alguien pudiera cambiar. Un token solo puede leer el dataset que nombra.
 */
export interface DatasetRequest extends Request {
  datasetClaims?: DatasetTokenClaims;
}

/** Claims que dejó `DatasetAccessGuard`. Falla cerrado si una ruta se quedó sin el guard. */
export function datasetClaimsOf(request: DatasetRequest): DatasetTokenClaims {
  if (!request.datasetClaims) {
    throw new UnauthorizedException('Falta el token de consulta del dataset');
  }
  return request.datasetClaims;
}

@Injectable()
export class DatasetAccessGuard implements CanActivate {
  constructor(private readonly datasetTokenService: DatasetTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<DatasetRequest>();
    const header = request.headers.authorization ?? '';

    if (!header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Falta el token de consulta del dataset');
    }

    request.datasetClaims = this.datasetTokenService.verify(header.slice('Bearer '.length));

    return true;
  }
}
