import { Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

/**
 * Credencial con la que el servicio de agentes activa human-in-the-loop en una conversación.
 *
 * Mismo patrón que `DatasetTokenService` (apps/gateway/src/automation/datasets/core/dataset-token.service.ts):
 * un token con alcance, firmado por instancia de tool, que nombra la organización, la conversación
 * y el workflow concretos, y caduca con la ejecución. Secreto propio (`INTERVENTION_TOKEN_SECRET`),
 * no `DATASET_TOKEN_SECRET` ni `AGENTS_INTERNAL_SECRET` — cada canal Agents→Gateway tiene el suyo a
 * propósito, para que un compromiso del servicio de agentes solo llegue hasta lo que ese canal
 * específico autoriza, no a forjar tokens de otro.
 *
 * Viaja dentro de `credentials` de la tool instance, igual que el de dataset.
 */
export interface InterventionTokenClaims {
  organizationId: string;
  conversationId: string;
  workflowId: string;
}

/** Margen sobre el timeout del workflow, para que el token no expire a media conversación. */
const TTL_MARGIN_SECONDS = 300;

@Injectable()
export class InterventionTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private get secret(): string {
    const secret = this.configService.get<string>('INTERVENTION_TOKEN_SECRET');

    if (!secret) {
      // Fallar cerrado, sin recaer en otro secreto: un respaldo así le devolvería al servicio de
      // agentes la capacidad de forjar tokens fuera del alcance que esta separación le quita.
      throw new InternalServerErrorException('INTERVENTION_TOKEN_SECRET no está configurado');
    }

    return secret;
  }

  async sign(claims: InterventionTokenClaims, workflowTimeoutSeconds: number): Promise<string> {
    return this.jwtService.signAsync(claims, {
      secret: this.secret,
      expiresIn: workflowTimeoutSeconds + TTL_MARGIN_SECONDS,
      audience: 'human-intervention',
    });
  }

  verify(token: string): InterventionTokenClaims {
    try {
      const payload = this.jwtService.verify<InterventionTokenClaims>(token, {
        secret: this.secret,
        audience: 'human-intervention',
      });

      if (!payload.organizationId || !payload.conversationId) {
        throw new UnauthorizedException('Token de intervención incompleto');
      }

      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Token de intervención inválido o expirado');
    }
  }
}
