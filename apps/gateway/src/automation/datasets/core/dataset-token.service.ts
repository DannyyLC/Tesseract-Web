import { Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

/**
 * Credencial con la que el servicio de agentes consulta un dataset.
 *
 * El canal Agents→Gateway no existía: hasta ahora los agentes solo hablaban con APIs de terceros y
 * nunca con el Gateway ni con la base de datos. Este token es lo que lo abre sin abrirlo de más.
 *
 * **Por qué un token con alcance y no una credencial a secas.** Se firma uno por instancia de tool,
 * que nombra la organización y el dataset concretos, y caduca con la ejecución: si se filtra en un
 * log, sirve para leer un catálogo durante unos minutos y nada más.
 *
 * **Por qué su propio secreto y no `AGENTS_INTERNAL_SECRET`.** Ese autentica el sentido
 * Gateway→Agents y por tanto vive también en el servicio de agentes. Como HS256 firma y verifica con
 * la misma llave, reutilizarlo aquí le daría a ese servicio la capacidad de emitirse tokens para
 * cualquier organización y cualquier catálogo, no solo de usar los que recibe. Y es la pieza más
 * expuesta que hay: ejecuta prompts escritos por clientes y habla con APIs de terceros.
 *
 * `DATASET_TOKEN_SECRET` no sale del Gateway. El servicio de agentes recibe estos tokens, nunca los
 * emite, así que un compromiso suyo llega hasta los catálogos que ya tenía asignados y no más allá.
 * Simétrico a propósito: aquí el que firma y el que verifica son el mismo, así que un par de claves
 * asimétricas sería gestión y rotación a cambio de nada.
 *
 * Viaja dentro de `credentials` de la tool instance, que es el campo que el Gateway ya redacta al
 * loguear el payload.
 */
export interface DatasetTokenClaims {
  organizationId: string;
  datasetId: string;
  workflowId: string;
}

/** Margen sobre el timeout del workflow, para que el token no expire a media conversación. */
const TTL_MARGIN_SECONDS = 300;

@Injectable()
export class DatasetTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private get secret(): string {
    const secret = this.configService.get<string>('DATASET_TOKEN_SECRET');

    if (!secret) {
      // Fallar cerrado, y sin recaer en `AGENTS_INTERNAL_SECRET`: un respaldo así devolvería
      // justo la capacidad de forjar que esta separación le quita al servicio de agentes.
      throw new InternalServerErrorException('DATASET_TOKEN_SECRET no está configurado');
    }

    return secret;
  }

  async sign(claims: DatasetTokenClaims, workflowTimeoutSeconds: number): Promise<string> {
    return this.jwtService.signAsync(claims, {
      secret: this.secret,
      expiresIn: workflowTimeoutSeconds + TTL_MARGIN_SECONDS,
      audience: 'dataset-query',
    });
  }

  verify(token: string): DatasetTokenClaims {
    try {
      const payload = this.jwtService.verify<DatasetTokenClaims>(token, {
        secret: this.secret,
        audience: 'dataset-query',
      });

      if (!payload.organizationId || !payload.datasetId) {
        throw new UnauthorizedException('Token de dataset incompleto');
      }

      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Token de dataset inválido o expirado');
    }
  }
}
