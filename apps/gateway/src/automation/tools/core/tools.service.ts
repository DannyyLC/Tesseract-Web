import { Injectable, Logger, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '@/platform/database/prisma.service';
import { KmsService } from './kms.service';
import { UpsertCredentialsDto } from './dto/upsert-credentials.dto';
import { ToolsOauthService } from './tools-oauth.service';
import { ToolHealthService } from './tool-health.service';
import { ToolConnectionStatus } from '@tesseract/database';

@Injectable()
export class ToolsService {
  private readonly logger = new Logger(ToolsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kmsService: KmsService,
    @Inject(forwardRef(() => ToolsOauthService))
    private readonly toolsOauthService: ToolsOauthService,
    private readonly toolHealthService: ToolHealthService,
  ) {}

  /**
   * Decrypts credentials for an array of TenantTools that already include the `credential` relation.
   */
  async populateDecryptedCredentials(tenantTools: any[]): Promise<Record<string, any>> {
    const credentialsMap: Record<string, any> = {};

    for (const tenantTool of tenantTools) {
      if (tenantTool.credential) {
        try {
          let accessToken = await this.kmsService.decrypt(
            tenantTool.credential.encryptedAccessToken,
          );
          let refreshToken = null;
          let expiresAt = tenantTool.credential.tokenExpiresAt;
          const provider = tenantTool.credential.oauthProvider;

          if (tenantTool.credential.encryptedRefreshToken) {
            refreshToken = await this.kmsService.decrypt(
              tenantTool.credential.encryptedRefreshToken,
            );
          }

          // COMPROBAMOS SI ESTÁ EXPIRADO (O A PUNTO DE EXPIRAR EN LOS PRÓXIMOS 5 MINUTOS)
          const isExpired = expiresAt && new Date(expiresAt).getTime() - 5 * 60 * 1000 < Date.now();

          if (isExpired && refreshToken && provider === 'google') {
            this.logger.log(`Token expired for tool ${tenantTool.id}, attempting refresh...`);
            try {
              const newTokens = await this.toolsOauthService.refreshGoogleToken(refreshToken);

              // Actualizamos nuestras variables en memoria para mandárselas a Python fresquecitas
              accessToken = newTokens.accessToken;
              expiresAt = new Date(Date.now() + newTokens.expiresIn * 1000);

              const encAccess = await this.kmsService.encrypt(accessToken);
              const encRefresh =
                newTokens.refreshToken !== refreshToken
                  ? await this.kmsService.encrypt(newTokens.refreshToken)
                  : tenantTool.credential.encryptedRefreshToken; // reusar el encriptado viejo si es el mismo texto

              // Guardamos en la bóveda de forma asíncrona pero esperando para evitar race conditions en lecturas inmediatas
              await this.prisma.tenantToolCredential.update({
                where: { tenantToolId: tenantTool.id },
                data: {
                  encryptedAccessToken: encAccess,
                  encryptedRefreshToken: encRefresh,
                  tokenExpiresAt: expiresAt,
                },
              });

              this.logger.log(
                `Successfully refreshed and re-encrypted token for tool ${tenantTool.id}`,
              );

              // El refresh funciona => si la habíamos marcado rota, ya no lo está.
              await this.toolHealthService.markHealthy(tenantTool.id);
            } catch {
              this.logger.error(
                `Failed to refresh token for tool ${tenantTool.id}. Manual re-auth might be required.`,
              );
              // Un refresh que falla es acceso perdido, no un tropiezo: el token
              // viejo ya venció. Se marca la tool para que la UI lo muestre y se
              // avise, en vez de dejar que Python coma un 401 en silencio.
              await this.toolHealthService.markAuthExpired(tenantTool.id);
            }
          } else if (isExpired && !refreshToken) {
            // Sin refresh token no hay recuperación posible: el access token ya
            // venció y nadie puede renovarlo. Muerte anunciada, no un aviso.
            await this.toolHealthService.markAuthExpired(tenantTool.id);
          }

          credentialsMap[tenantTool.id] = {
            accessToken,
            refreshToken,
            expiresAt,
            provider,
          };
        } catch (error) {
          this.logger.error(
            `Error decrypting credentials for tool ${tenantTool.id}: ${(error as Error).message}`,
          );
          // Decide whether to throw or allow tool without credentials (failing downstream in python).
          // For now, securely skip adding credentials.
        }
      }
    }

    return credentialsMap;
  }

  /**
   * Sondeo diario de todas las credenciales conectadas.
   *
   * Sin esto el estado sano miente: `populateDecryptedCredentials` solo corre
   * cuando alguien usa la herramienta, así que una credencial revocada el viernes
   * se ve "Conectada" hasta que un cliente escriba el lunes. El sondeo reusa esa
   * misma ruta —incluido el refresh y el marcado— porque a las 24h el access
   * token siempre está vencido y el refresh se dispara solo.
   *
   * @returns Cuántas herramientas se revisaron.
   */
  async probeAllCredentials(batchSize = 100): Promise<number> {
    let cursor: string | undefined;
    let probed = 0;

    for (;;) {
      const batch = await this.prisma.tenantTool.findMany({
        where: { deletedAt: null, isConnected: true, credential: { isNot: null } },
        include: { credential: true },
        orderBy: { id: 'asc' },
        take: batchSize,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      if (batch.length === 0) break;

      // Una credencial rota no debe impedir sondear las demás.
      await this.populateDecryptedCredentials(batch);

      probed += batch.length;
      cursor = batch[batch.length - 1].id;

      if (batch.length < batchSize) break;
    }

    return probed;
  }

  /**
   * Encrypts and saves OAuth credentials directly to the TenantToolCredential vault.
   * Modifies the TenantTool state to connected.
   */
  async upsertCredentials(
    tenantToolId: string,
    orgId: string,
    userId: string,
    data: UpsertCredentialsDto,
  ) {
    const tool = await this.prisma.tenantTool.findFirst({
      where: { id: tenantToolId, organizationId: orgId },
    });

    if (!tool) {
      throw new NotFoundException('Tool not found');
    }

    if (tool.createdByUserId && tool.createdByUserId !== userId) {
      throw new Error('No tienes permisos para modificar las credenciales de esta herramienta');
    }

    // Encrypt Tokens
    const encAccess = await this.kmsService.encrypt(data.accessToken);
    let encRefresh = null;
    if (data.refreshToken) {
      encRefresh = await this.kmsService.encrypt(data.refreshToken);
    }

    const expiresAt = data.expiresAt
      ? new Date(data.expiresAt)
      : new Date(Date.now() + 3600 * 1000);

    // Preparamos el profile para mezclarlo con cualquier config existente
    let updatedConfig = tool.config && typeof tool.config === 'object' ? tool.config : {};
    if (data.profile) {
      updatedConfig = {
        ...updatedConfig,
        profile: data.profile,
      };
    }

    // Transaction to safely update both shell (TenantTool) and vault (TenantToolCredential)
    await this.prisma.$transaction(async (tx) => {
      await tx.tenantToolCredential.upsert({
        where: { tenantToolId },
        update: {
          encryptedAccessToken: encAccess,
          encryptedRefreshToken: encRefresh,
          tokenExpiresAt: expiresAt,
          scopes: data.scopes ?? [],
          oauthProvider: data.provider,
        },
        create: {
          tenantToolId,
          encryptedAccessToken: encAccess,
          encryptedRefreshToken: encRefresh,
          tokenExpiresAt: expiresAt,
          scopes: data.scopes ?? [],
          oauthProvider: data.provider,
        },
      });

      await tx.tenantTool.update({
        where: { id: tenantToolId },
        data: {
          status: ToolConnectionStatus.CONNECTED,
          isConnected: true,
          connectionError: null,
          config: updatedConfig,
          ...(tool.createdByUserId ? {} : { createdByUserId: userId }),
        },
      });
    });

    // Google deja desmarcar permisos individuales en la pantalla de consentimiento,
    // así que "conectado" no implica "puede hacer todo lo que habilitaste". Este es
    // el único momento en que sabemos con certeza qué otorgó el usuario.
    await this.toolHealthService.syncScopeHealth(tenantToolId);
  }
}
