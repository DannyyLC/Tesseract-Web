import { Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

/**
 * Credencial con la que el servicio de agentes consulta un dataset.
 *
 * El canal Agents→Gateway no existía: hasta ahora los agentes solo hablaban con APIs de terceros y
 * nunca con el Gateway ni con la base de datos. Este token es lo que lo abre sin abrirlo de más.
 *
 * **Por qué un token con alcance y no el secreto compartido a secas.** `AGENTS_INTERNAL_SECRET` ya
 * autentica el sentido Gateway→Agents, pero usarlo tal cual en el sentido inverso daría a cualquier
 * llamada acceso a cualquier dataset de cualquier organización. Aquí se firma un token por instancia
 * de tool que nombra la organización y el dataset concretos, y caduca con la ejecución: si se filtra
 * en un log, sirve para leer un catálogo durante unos minutos y nada más.
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
    const secret = this.configService.get<string>('AGENTS_INTERNAL_SECRET');

    if (!secret) {
      // Fallar cerrado: sin secreto no hay forma de validar nada del otro lado.
      throw new InternalServerErrorException('AGENTS_INTERNAL_SECRET no está configurado');
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
