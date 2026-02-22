import { Injectable, Logger, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { KmsService } from './kms.service';
import { UpsertCredentialsDto } from './dto/upsert-credentials.dto';
import { ToolsOauthService } from './tools-oauth.service';

@Injectable()
export class ToolsService {
  private readonly logger = new Logger(ToolsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kmsService: KmsService,
    @Inject(forwardRef(() => ToolsOauthService))
    private readonly toolsOauthService: ToolsOauthService,
  ) {}

  /**
   * Decrypts credentials for an array of TenantTools that already include the `credential` relation.
   */
  async populateDecryptedCredentials(tenantTools: any[]): Promise<Record<string, any>> {
    const credentialsMap: Record<string, any> = {};

    for (const tenantTool of tenantTools) {
      if (tenantTool.credential) {
        try {
          let accessToken = await this.kmsService.decrypt(tenantTool.credential.encryptedAccessToken);
          let refreshToken = null;
          let expiresAt = tenantTool.credential.tokenExpiresAt;
          const provider = tenantTool.credential.oauthProvider;

          if (tenantTool.credential.encryptedRefreshToken) {
            refreshToken = await this.kmsService.decrypt(tenantTool.credential.encryptedRefreshToken);
          }

          // COMPROBAMOS SI ESTÁ EXPIRADO (O A PUNTO DE EXPIRAR EN LOS PRÓXIMOS 5 MINUTOS)
          const isExpired = expiresAt && (new Date(expiresAt).getTime() - 5 * 60 * 1000) < Date.now();

          if (isExpired && refreshToken && provider === 'google') {
            this.logger.log(`Token expired for tool ${tenantTool.id}, attempting refresh...`);
            try {
              const newTokens = await this.toolsOauthService.refreshGoogleToken(refreshToken);
              
              // Actualizamos nuestras variables en memoria para mandárselas a Python fresquecitas
              accessToken = newTokens.accessToken;
              expiresAt = new Date(Date.now() + newTokens.expiresIn * 1000);
              
              const encAccess = await this.kmsService.encrypt(accessToken);
              const encRefresh = newTokens.refreshToken !== refreshToken 
                ? await this.kmsService.encrypt(newTokens.refreshToken) 
                : tenantTool.credential.encryptedRefreshToken; // reusar el encriptado viejo si es el mismo texto
              
              // Guardamos en la bóveda de forma asíncrona pero esperando para evitar race conditions en lecturas inmediatas
              await this.prisma.tenantToolCredential.update({
                where: { tenantToolId: tenantTool.id },
                data: {
                  encryptedAccessToken: encAccess,
                  encryptedRefreshToken: encRefresh,
                  tokenExpiresAt: expiresAt,
                }
              });

              this.logger.log(`Successfully refreshed and re-encrypted token for tool ${tenantTool.id}`);
            } catch (refreshErr) {
              this.logger.error(`Failed to refresh token for tool ${tenantTool.id}. Manual re-auth might be required.`);
              // Si falla el refresh, mandamos el viejo de todas formas. Python fallará y manejará el 401.
            }
          }

          credentialsMap[tenantTool.id] = {
            accessToken,
            refreshToken,
            expiresAt,
            provider,
          };
        } catch (error) {
          this.logger.error(`Error decrypting credentials for tool ${tenantTool.id}: ${(error as Error).message}`);
          // Decide whether to throw or allow tool without credentials (failing downstream in python).
          // For now, securely skip adding credentials.
        }
      }
    }

    return credentialsMap;
  }

  /**
   * Encrypts and saves OAuth credentials directly to the TenantToolCredential vault.
   * Modifies the TenantTool state to connected.
   */
  async upsertCredentials(tenantToolId: string, orgId: string, userId: string, data: UpsertCredentialsDto) {
    const tool = await this.prisma.tenantTool.findFirst({
      where: { id: tenantToolId, organizationId: orgId }
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

    const expiresAt = data.expiresAt ? new Date(data.expiresAt) : new Date(Date.now() + 3600 * 1000);

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
        }
      });

      await tx.tenantTool.update({
        where: { id: tenantToolId },
        data: { 
          status: 'connected', 
          isConnected: true, 
          config: updatedConfig,
          ...(tool.createdByUserId ? {} : { createdByUserId: userId })
        }
      });
    });
  }

  /**
   * Executes a strict Hard-Delete on the OAuth credentials and a Soft-Delete on the tool instance.
   */
  async disconnectTool(tenantToolId: string, orgId: string, userId: string) {
    const tool = await this.prisma.tenantTool.findFirst({
      where: { id: tenantToolId, organizationId: orgId }
    });

    if (!tool) {
      throw new NotFoundException('Tool not found');
    }

    if (tool.createdByUserId && tool.createdByUserId !== userId) {
      throw new Error('No tienes permisos para desconectar esta herramienta');
    }

    await this.prisma.$transaction(async (tx) => {
      // 1. HARD DELETE of PII Secrets Bóveda
      await tx.tenantToolCredential.deleteMany({
        where: { tenantToolId }
      });

      // 2. SOFT DELETE of shell (to keep execution history) y status update
      await tx.tenantTool.update({
        where: { id: tenantToolId },
        data: { 
          status: 'expired_auth',
          isConnected: false,
          deletedAt: new Date(),
        }
      });
    });
  }
}

