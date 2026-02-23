import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import axios from 'axios';

@Injectable()
export class ToolsOauthService {
  private readonly logger = new Logger(ToolsOauthService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Genera la URL de autorización de Google para OAuth 2.0.
   * Empaqueta el tenantToolId de forma segura en el parámetro 'state'.
   */
  async generateGoogleAuthUrl(
    tenantToolId: string,
    organizationId: string,
    userId: string,
  ): Promise<string> {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) {
      throw new Error('GOOGLE_CLIENT_ID not configured');
    }

    const redirectUri = this.getRedirectUri();

    // Obtener la herramienta y sus scopes configurados en el catálogo
    const tool = await this.prisma.tenantTool.findUnique({
      where: { id: tenantToolId, organizationId },
      include: {
        toolCatalog: {
          include: {
            functions: true,
          },
        },
      },
    });

    if (!tool) {
      throw new BadRequestException('Tenant tool not found');
    }

    // Extraer las funciones permitidas para esta instancia específica de la herramienta
    // O si no hay filtro explícito, tomar todas las funciones del catálogo para esta tool
    const allowedFunctionNames =
      tool.allowedFunctions && Array.isArray(tool.allowedFunctions)
        ? tool.allowedFunctions
        : tool.toolCatalog.functions.map((f: any) => f.functionName);

    // Mapeo Dinámico de funciones a Scopes directo desde la Base de Datos
    // Filtramos las funciones del catálogo que el usuario "encendió" para esta herramienta
    const allowedFunctions = tool.toolCatalog.functions.filter((f: any) =>
      allowedFunctionNames.includes(f.functionName),
    );

    // Extraemos todos los scopes de esas funciones, aplanamos la lista y quitamos duplicados con Set
    const scopesList = Array.from(
      new Set(allowedFunctions.flatMap((f: any) => f.oauthScopes || [])),
    );

    // Opcional: Asegurar que siempre pidamos el perfil básico para identificar a quién le dimos el token
    if (
      !scopesList.includes('https://www.googleapis.com/auth/userinfo.email') &&
      tool.toolCatalog.provider === 'google'
    ) {
      scopesList.push('https://www.googleapis.com/auth/userinfo.email');
      scopesList.push('https://www.googleapis.com/auth/userinfo.profile');
    }

    const scopes = scopesList.join(' ');

    // Empaquetar IDs en el state
    const statePayload = {
      t: tenantToolId,
      o: organizationId,
      u: userId,
    };
    const state = Buffer.from(JSON.stringify(statePayload)).toString('base64');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes,
      access_type: 'offline', // MUY IMPORTANTE para obtener el Refresh Token
      prompt: 'consent', // Fuerza la pantalla de consentimiento para asegurar un nuevo Refresh Token
      state: state,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Intercambia el código devuelto por Google por los tokens de acceso y refresco.
   */
  async exchangeGoogleCode(code: string) {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri = this.getRedirectUri();

    if (!clientId || !clientSecret) {
      throw new Error('Google OAuth credentials not configured');
    }

    try {
      const { data } = await axios.post('https://oauth2.googleapis.com/token', {
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      });

      // 2. Usar el nuevo Access Token para extraer el perfil del usuario (Paso 3.5)
      const profile = await this.fetchGoogleUserProfile(data.access_token);

      // data contiene: access_token, refresh_token, expires_in, token_type, scope
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token, // Puede ser undefined si el usuario no dio consentimiento (o si no es su primer login sin prompt=consent)
        expiresIn: data.expires_in, // Segundos
        scopes: data.scope ? data.scope.split(' ') : [],
        profile,
      };
    } catch (error: any) {
      this.logger.error(
        `Error exchanging Google code: ${error?.response?.data?.error_description || error.message}`,
      );
      throw new BadRequestException('Failed to exchange authorization code with Google');
    }
  }

  /**
   * Usa un Refresh Token previamente guardado para obtener un nuevo Access Token de Google.
   */
  async refreshGoogleToken(refreshToken: string) {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new Error('Google OAuth credentials not configured');
    }

    try {
      const { data } = await axios.post('https://oauth2.googleapis.com/token', {
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      });

      return {
        accessToken: data.access_token,
        expiresIn: data.expires_in, // Segundos
        // Notar que Google rara vez envía un nuevo refresh_token aquí, a menos que el anterior esté por caducar por políticas raras.
        refreshToken: data.refresh_token || refreshToken,
      };
    } catch (error: any) {
      this.logger.error(
        `Error refreshing Google token: ${error?.response?.data?.error_description || error.message}`,
      );
      throw new BadRequestException('Failed to refresh Google authorization token');
    }
  }

  /**
   * Obtiene la información básica del usuario (email, picture) usando el Access Token fresco.
   */
  private async fetchGoogleUserProfile(accessToken: string) {
    try {
      const { data } = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      return {
        email: data.email,
        name: data.name,
        picture: data.picture,
      };
    } catch (error: any) {
      this.logger.warn(
        `Failed to fetch Google user profile: ${error.message}. Scopes might be missing.`,
      );
      return null;
    }
  }

  private getRedirectUri(): string {
    const customUrl = this.configService.get<string>('GOOGLE_TOOLS_CALLBACK_URL');
    if (customUrl) return customUrl;

    // Fallback normal usando la base URL de la API del entorno
    const baseApiUrl =
      this.configService.get<string>('DOMAIN_BASE_URL') || 'http://localhost:3000/api';
    return `${baseApiUrl}/tools/oauth/google/callback`;
  }
}
