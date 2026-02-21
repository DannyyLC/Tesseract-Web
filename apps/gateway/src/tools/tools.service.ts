import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { KmsService } from './kms.service';
import { UpsertCredentialsDto } from './dto/upsert-credentials.dto';

@Injectable()
export class ToolsService {
  private readonly logger = new Logger(ToolsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kmsService: KmsService,
  ) {}

  /**
   * Decrypts credentials for an array of TenantTools that already include the `credential` relation.
   */
  async populateDecryptedCredentials(tenantTools: any[]): Promise<Record<string, any>> {
    const credentialsMap: Record<string, any> = {};

    for (const tenantTool of tenantTools) {
      if (tenantTool.credential) {
        // TODO: In a production scenario, we should intercept here to check token expiration 
        // (tokenExpiresAt) and call the external Provider (Google, etc.) to refresh the token 
        // if necessary, updating the database before continuing.

        try {
          const accessToken = await this.kmsService.decrypt(tenantTool.credential.encryptedAccessToken);
          
          let refreshToken = null;
          if (tenantTool.credential.encryptedRefreshToken) {
            refreshToken = await this.kmsService.decrypt(tenantTool.credential.encryptedRefreshToken);
          }

          credentialsMap[tenantTool.id] = {
            accessToken,
            refreshToken,
            expiresAt: tenantTool.credential.tokenExpiresAt,
            provider: tenantTool.credential.oauthProvider,
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
          // Assign ownership if it wasn't set during creation
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

