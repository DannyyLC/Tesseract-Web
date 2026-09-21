import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuth } from 'google-auth-library';
import { calendar_v3, google } from 'googleapis';

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const JWT_BEARER_GRANT = 'urn:ietf:params:oauth:grant-type:jwt-bearer';

/** Margen para no entregar un token que caduca mientras la request sigue en vuelo. */
const EXPIRY_SKEW_MS = 60_000;

/**
 * Cliente autenticado de Google Calendar para la agenda propia de Tesseract.
 *
 * Antes un SUPER_ADMIN conectaba su cuenta de Google por OAuth desde el panel y el refresh token
 * se guardaba cifrado. Toda la agenda colgaba de una persona: si se iba de la empresa o revocaba
 * el consentimiento, el booking se caía en silencio. Ahora la service account del Gateway
 * suplanta a una cuenta dedicada de Workspace (`BOOKING_IMPERSONATED_USER`) por domain-wide
 * delegation, así que no hay token que caduque ni cuenta que elegir.
 *
 * Las credenciales van por ADC, igual que `KmsService` y `CloudStorageService`: en Cloud Run las
 * toma de la service account del servicio y en local del `gcloud auth application-default login`.
 * Nunca hay un archivo de llave en el repositorio — la service account se firma a sí misma con
 * `iamcredentials.signJwt`, lo que exige `roles/iam.serviceAccountTokenCreator` sobre sí misma.
 *
 * `google-auth-library` no cubre este caso: su clase `Impersonated` usa `generateAccessToken`,
 * que no acepta `subject` y por tanto no hace delegación de dominio. De ahí las dos llamadas a
 * mano —firmar la aserción y canjearla— en vez de un cliente de fábrica.
 *
 * Se habla con la API REST en vez de con `@google-cloud/iam-credentials` por el mismo motivo ya
 * documentado en `CloudTasksService`: el cliente oficial es ESM sobre un build CommonJS y
 * arrastra gRPC, caro en un servicio que escala a cero. Firmar un JWT es un POST.
 */
@Injectable()
export class BookingCalendarService {
  private readonly logger = new Logger(BookingCalendarService.name);
  private readonly auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });

  /** Calendario del usuario suplantado donde se crean los eventos. */
  readonly calendarId: string;

  /**
   * Google Group del equipo de soporte. Si está definido, su free/busy se cruza con el del
   * calendario destino y se le invita a cada evento. `null` = solo cuenta el calendario destino.
   */
  readonly availabilityGroupEmail: string | null;

  private readonly impersonatedUser: string;
  private readonly configuredServiceAccountEmail: string;

  private serviceAccountEmail?: string;
  private cached: { token: string; expiresAt: number } | null = null;
  private inflight: Promise<string> | null = null;

  constructor(private readonly configService: ConfigService) {
    this.impersonatedUser = this.configService.get<string>('BOOKING_IMPERSONATED_USER', '');
    this.calendarId = this.configService.get<string>('BOOKING_CALENDAR_ID', '') || 'primary';
    this.availabilityGroupEmail =
      this.configService.get<string>('BOOKING_AVAILABILITY_GROUP_EMAIL', '') || null;
    this.configuredServiceAccountEmail = this.configService.get<string>(
      'BOOKING_SERVICE_ACCOUNT_EMAIL',
      '',
    );
  }

  /**
   * Cliente listo para usar. Se construye uno nuevo en cada llamada a propósito: es barato y
   * evita que un cliente longevo se quede con un access token ya caducado.
   */
  async getClient(): Promise<calendar_v3.Calendar> {
    const accessToken = await this.getAccessToken();

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    return google.calendar({ version: 'v3', auth });
  }

  private async getAccessToken(): Promise<string> {
    if (!this.impersonatedUser) {
      throw new ServiceUnavailableException(
        'BOOKING_IMPERSONATED_USER no está configurada: no hay agenda que consultar.',
      );
    }

    if (this.cached && this.cached.expiresAt > Date.now() + EXPIRY_SKEW_MS) {
      return this.cached.token;
    }

    // Un arranque en frío puede recibir varias requests a la vez. Sin esto, cada una acuñaría su
    // propio token gastando dos llamadas de red para llegar todas al mismo resultado.
    // Ojo: `this.inflight` tiene que ser la promesa derivada del `finally`, no la original. Si
    // se guardase la original y se encadenase aparte, la derivada quedaría sin dueño y un fallo
    // de credenciales se convertiría en un unhandled rejection que tumba el proceso.
    this.inflight ??= this.mintAccessToken().finally(() => {
      this.inflight = null;
    });

    return this.inflight;
  }

  private async mintAccessToken(): Promise<string> {
    const assertion = await this.signAssertion();

    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: JWT_BEARER_GRANT, assertion }).toString(),
    });

    if (!response.ok) {
      const body = await response.text();
      // `unauthorized_client` aquí significa que falta autorizar el Client ID de la service
      // account en el Admin Console, o que el scope no coincide carácter a carácter.
      this.logger.error(
        `Intercambio jwt-bearer rechazado por Google. status=${response.status} body=${body}`,
      );
      throw new ServiceUnavailableException('No se pudo obtener acceso al calendario de reservas.');
    }

    const data = (await response.json()) as { access_token: string; expires_in: number };
    this.cached = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    return data.access_token;
  }

  private async signAssertion(): Promise<string> {
    const serviceAccountEmail = await this.resolveServiceAccountEmail();
    const issuedAt = Math.floor(Date.now() / 1000);

    // `sub` es lo que convierte esto en delegación de dominio: el token resultante actúa como el
    // usuario de Workspace, no como la service account.
    const claims = {
      iss: serviceAccountEmail,
      sub: this.impersonatedUser,
      scope: CALENDAR_SCOPE,
      aud: TOKEN_ENDPOINT,
      iat: issuedAt,
      exp: issuedAt + 3600,
    };

    const client = await this.auth.getClient();
    const accessToken = await client.getAccessToken();

    const response = await fetch(
      `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(
        serviceAccountEmail,
      )}:signJwt`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ payload: JSON.stringify(claims) }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      // Un 403 aquí es casi siempre que a la service account le falta
      // `roles/iam.serviceAccountTokenCreator` sobre sí misma.
      this.logger.error(`signJwt falló. status=${response.status} body=${body}`);
      throw new ServiceUnavailableException('No se pudo firmar la credencial del calendario.');
    }

    const { signedJwt } = (await response.json()) as { signedJwt: string };
    return signedJwt;
  }

  private async resolveServiceAccountEmail(): Promise<string> {
    if (this.serviceAccountEmail) {
      return this.serviceAccountEmail;
    }

    if (this.configuredServiceAccountEmail) {
      this.serviceAccountEmail = this.configuredServiceAccountEmail;
      return this.serviceAccountEmail;
    }

    // En Cloud Run el metadata server lo expone. Con ADC de usuario en local no hay ninguno, y
    // por eso existe `BOOKING_SERVICE_ACCOUNT_EMAIL`.
    const { client_email: clientEmail } = await this.auth.getCredentials();
    if (!clientEmail) {
      throw new ServiceUnavailableException(
        'No se pudo descubrir el email de la service account. En local hay que fijar BOOKING_SERVICE_ACCOUNT_EMAIL.',
      );
    }

    this.serviceAccountEmail = clientEmail;
    return clientEmail;
  }
}
