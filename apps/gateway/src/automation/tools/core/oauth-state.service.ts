import { randomUUID } from 'crypto';
import { Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { WebhookDedupService } from '@/platform/webhooks/webhook-dedup.service';

/**
 * `state` del flujo OAuth con el que se conecta una tool a Google.
 *
 * Google lo devuelve tal cual al callback, y el callback no tiene sesión: todo lo que sabe de
 * a qué tool, organización y usuario corresponde la autorización sale de aquí. Antes era un JSON
 * en base64 sin firma, así que cualquiera podía escribir el suyo y colgarle a la tool de otro su
 * propia cuenta de Google (y recibir en ella las citas y filas con datos de clientes).
 *
 * Ahora es un JWT firmado con un secreto propio (`OAUTH_STATE_SECRET`, mismo criterio que
 * `DATASET_TOKEN_SECRET` e `INTERVENTION_TOKEN_SECRET`: uno por propósito), que caduca en minutos
 * y se consume una sola vez.
 */
export interface OauthStateClaims {
  tenantToolId: string;
  organizationId: string;
  userId: string;
}

/** Lo que tarda alguien en pasar la pantalla de consentimiento de Google, con holgura. */
const STATE_TTL_SECONDS = 600;
const AUDIENCE = 'tools-oauth-state';
const DEDUP_PROVIDER = 'tools-oauth-state';

@Injectable()
export class OauthStateService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly dedup: WebhookDedupService,
  ) {}

  private get secret(): string {
    const secret = this.configService.get<string>('OAUTH_STATE_SECRET');
    if (!secret) {
      // Fallar cerrado y sin recaer en otro secreto: con uno compartido, un token de otro
      // propósito podría pasar por `state`.
      throw new InternalServerErrorException('OAUTH_STATE_SECRET no está configurado');
    }
    return secret;
  }

  async sign(claims: OauthStateClaims): Promise<string> {
    return this.jwtService.signAsync(claims, {
      secret: this.secret,
      expiresIn: STATE_TTL_SECONDS,
      audience: AUDIENCE,
      jwtid: randomUUID(),
    });
  }

  /**
   * Verifica firma y caducidad, y consume el `state`: un segundo uso del mismo se rechaza, así
   * que uno filtrado (historial, logs de un proxy) no sirve para repetir la conexión.
   */
  async consume(state: string): Promise<OauthStateClaims> {
    let payload: OauthStateClaims & { jti?: string };
    try {
      payload = await this.jwtService.verifyAsync(state, {
        secret: this.secret,
        audience: AUDIENCE,
      });
    } catch {
      throw new UnauthorizedException('state de OAuth inválido o expirado');
    }

    if (!payload.jti || !payload.tenantToolId || !payload.organizationId || !payload.userId) {
      throw new UnauthorizedException('state de OAuth incompleto');
    }

    if (!(await this.dedup.claim(DEDUP_PROVIDER, payload.jti))) {
      throw new UnauthorizedException('state de OAuth ya utilizado');
    }

    return {
      tenantToolId: payload.tenantToolId,
      organizationId: payload.organizationId,
      userId: payload.userId,
    };
  }
}
