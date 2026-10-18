import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ToolsOauthService } from './tools-oauth.service';
import { ToolsService } from './tools.service';
import { JwtAuthGuard } from '@/identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/identity/auth/guards/roles.guard';
import { Roles } from '@/identity/auth/decorators/roles.decorator';
import { UserRole } from '@tesseract/types';
import { CurrentUser } from '@/identity/auth/decorators/current-user.decorator';
import { UserPayload } from '@/platform/common/types/jwt-payload.type';
import { ConfigService } from '@nestjs/config';
import { OauthStateService } from './oauth-state.service';
import { errorMessage } from '@/platform/common/utils/error-message';

@Controller('tools/oauth')
export class ToolsOauthController {
  private readonly logger = new Logger(ToolsOauthController.name);

  constructor(
    private readonly toolsOauthService: ToolsOauthService,
    private readonly toolsService: ToolsService,
    private readonly configService: ConfigService,
    private readonly oauthState: OauthStateService,
  ) {}

  /**
   * Frontend redirecciona aquí para iniciar el flujo.
   * El Backend construye la URL y redirige al usuario hacia Google.
   */
  @Get('google/auth-url')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async generateAuthUrl(
    @Query('tenantToolId') tenantToolId: string,
    @CurrentUser() user: UserPayload,
    @Res() res: Response,
  ) {
    if (!tenantToolId) {
      throw new BadRequestException('tenantToolId is required');
    }

    const authUrl = await this.toolsOauthService.generateGoogleAuthUrl(
      tenantToolId,
      user.organizationId,
      user.sub,
    );

    return res.redirect(authUrl);
  }

  /**
   * Google redirecciona de regreso a este endpoint.
   * Cambiamos el 'code' temporal por tokens a largo plazo y los guardamos en KMS.
   * NOTA: Este endpoint es llamado por Google, por lo que NO tiene un JwtAuthGuard.
   * Quién inició la conexión sale del `state` firmado, que se consume una sola vez; y antes de
   * canjear el code se comprueba que esa persona todavía pueda conectar la tool.
   */
  @Get('google/callback')
  async handleGoogleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3001';
    // La pantalla de integraciones del front es /integrations y lee `status` / `error` para
    // avisar el resultado. Antes se mandaba a /tools, que no existe: la conexión se guardaba
    // pero el usuario terminaba en un 404.
    const integrationsUrl = `${frontendUrl}/integrations`;
    const errorRedirect = `${integrationsUrl}?error=oauth_failed`;

    // 1. Manejar si el usuario denegó permisos
    if (error) {
      this.logger.warn(`User denied Google OAuth access. Error: ${error}`);
      return res.redirect(`${integrationsUrl}?error=access_denied`);
    }

    if (!code || !state) {
      this.logger.error('Missing code or state in OAuth callback');
      return res.redirect(errorRedirect);
    }

    try {
      // 2. Verificar y consumir el state; después, que quien lo emitió siga pudiendo conectar.
      //    Ambos antes de canjear el code: un state falso no debe llegar a hablar con Google.
      const claims = await this.oauthState.consume(state);
      await this.toolsOauthService.assertCanConnect(claims);
      const { tenantToolId, organizationId, userId } = claims;

      // 3. Intercambiar el Code por Tokens (Google API)
      const tokensInfo = await this.toolsOauthService.exchangeGoogleCode(code);

      // 4. Guardar y Cifrar en la base de datos (KMS Vault)
      const expiresAt = new Date(Date.now() + tokensInfo.expiresIn * 1000);

      await this.toolsService.upsertCredentials(tenantToolId, organizationId, userId, {
        provider: 'google',
        accessToken: tokensInfo.accessToken,
        refreshToken: tokensInfo.refreshToken, // Puede ser null si ya había aceptado antes
        expiresAt: expiresAt,
        scopes: tokensInfo.scopes,
      });

      this.logger.log(`Successfully connected Google Tool ${tenantToolId} for user ${userId}`);

      // 5. Redirigir al UI con éxito
      return res.redirect(`${integrationsUrl}?status=success`);
    } catch (err) {
      this.logger.error(`Failed to handle Google callback: ${errorMessage(err)}`);
      return res.redirect(`${integrationsUrl}?error=callback_processing_failed`);
    }
  }
}
