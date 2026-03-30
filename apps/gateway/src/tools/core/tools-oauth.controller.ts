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
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserPayload } from '../../common/types/jwt-payload.type';
import { ConfigService } from '@nestjs/config';

@Controller('tools/oauth')
export class ToolsOauthController {
  private readonly logger = new Logger(ToolsOauthController.name);

  constructor(
    private readonly toolsOauthService: ToolsOauthService,
    private readonly toolsService: ToolsService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Frontend redirecciona aquí para iniciar el flujo.
   * El Backend construye la URL y redirige al usuario hacia Google.
   */
  @Get('google/auth-url')
  @UseGuards(JwtAuthGuard)
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
   * La validación de quién lo hizo reside en la firma secreta del 'state' devuelto.
   */
  @Get('google/callback')
  async handleGoogleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3001';
    const errorRedirect = `${frontendUrl}/tools?error=oauth_failed`;

    // 1. Manejar si el usuario denegó permisos
    if (error) {
      this.logger.warn(`User denied Google OAuth access. Error: ${error}`);
      return res.redirect(`${frontendUrl}/tools?error=access_denied`);
    }

    if (!code || !state) {
      this.logger.error('Missing code or state in OAuth callback');
      return res.redirect(errorRedirect);
    }

    try {
      // 2. Desempaquetar el estado para conocer de quién y de qué tool se trata
      const decodedState = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
      const { t: tenantToolId, o: organizationId, u: userId } = decodedState;

      if (!tenantToolId || !organizationId || !userId) {
        throw new Error('Invalid state payload missing required IDs');
      }

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
      return res.redirect(`${frontendUrl}/tools?status=success`);
    } catch (err: any) {
      this.logger.error(`Failed to handle Google callback: ${err.message}`);
      return res.redirect(`${frontendUrl}/tools?error=callback_processing_failed`);
    }
  }
}
