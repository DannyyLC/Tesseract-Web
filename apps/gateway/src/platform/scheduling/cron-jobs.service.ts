import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { ConversationStatus, ChatRole } from '@tesseract/database';
import { ToolsService } from '@/automation/tools/core/tools.service';
import { CfdiRetryService } from '@/billing/invoice/cfdi-retry.service';

@Injectable()
export class CronJobsService {
  private readonly logger = new Logger(CronJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly toolsService: ToolsService,
    private readonly cfdiRetryService: CfdiRetryService,
  ) {}

  // Runs every hour
  @Cron('0 * * * *')
  async handleCleanup() {
    await this.prisma.userVerification.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });
  }

  // Runs every day at midnight (00:00)
  @Cron('0 0 * * *')
  async handleConversationCleanup() {
    const now = new Date();

    const result = await this.prisma.conversation.updateMany({
      where: {
        status: ConversationStatus.ACTIVE,
        autoCloseAt: { not: null, lte: now },
        NOT: {
          isHumanInTheLoop: true,
          lastMessageRole: ChatRole.USER,
        },
      },
      data: {
        status: ConversationStatus.CLOSED,
        closedAt: now,
      },
    });

    if (result.count > 0) {
      this.logger.log(`Daily Auto-close: Closed ${result.count} inactive conversations`);
    }
  }

  // Runs every day at midnight (00:00)
  @Cron('0 0 * * *')
  async handleRefreshTokenCleanup() {
    // Delete expired tokens OR revoked tokens older than 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const result = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } }, // Expired
          { revokedAt: { lt: sevenDaysAgo } }, // Revoked > 7 days ago
        ],
      },
    });

    if (result.count > 0) {
      this.logger.log(
        `Daily Token Cleanup: Deleted ${result.count} expired/revoked refresh tokens`,
      );
    }
  }

  // Runs every day at midnight (00:00)
  @Cron('0 0 * * *')
  async handleProcessedWebhookEventCleanup() {
    // Los claims de deduplicación solo sirven mientras el proveedor pueda
    // reintentar. Stripe reintenta hasta 3 días; 30 da margen de sobra.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await this.prisma.processedWebhookEvent.deleteMany({
      where: {
        processedAt: { lt: thirtyDaysAgo },
      },
    });

    if (result.count > 0) {
      this.logger.log(`Daily Webhook Cleanup: Deleted ${result.count} processed webhook events`);
    }
  }

  // Runs every day at midnight (00:00)
  @Cron('0 0 * * *')
  async handleNotificationCleanup() {
    // Auto-soft-delete read notifications older than 30 days to clear the user's feed
    // but keep them in the database for history/audit.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await this.prisma.userNotification.updateMany({
      where: {
        isRead: true,
        createdAt: { lt: thirtyDaysAgo },
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    if (result.count > 0) {
      this.logger.log(
        `Daily Notification Auto-Archive: Soft-deleted ${result.count} old read notifications`,
      );
    }
  }

  // Runs every day at 03:00
  @Cron('0 3 * * *')
  async handleToolCredentialProbe() {
    // Detecta credenciales revocadas antes de que las descubra un cliente a
    // media conversación. `probeAllCredentials` marca EXPIRED_AUTH y notifica
    // por su cuenta; aquí solo se dispara y se registra el barrido.
    try {
      const probed = await this.toolsService.probeAllCredentials();
      this.logger.log(`Daily Tool Credential Probe: checked ${probed} connected tool(s)`);
    } catch (error) {
      this.logger.error(`Daily Tool Credential Probe failed: ${(error as Error).message}`);
    }
  }

  // Runs every day at 04:00
  @Cron('0 4 * * *')
  async handleCfdiRetrySweep() {
    // Red de seguridad del timbrado. Si el CFDI falla en el momento del cobro y nadie pulsa
    // el botón del panel, esa factura no sale nunca — y una factura de enero sin timbrar en
    // enero se convierte en un problema del contador, porque corregirla después del cierre
    // exige cancelar ante el SAT.
    //
    // `retryPending` decide a quién toca y agrupa el aviso; aquí solo se dispara y se registra.
    try {
      const result = await this.cfdiRetryService.retryPending();
      if (result.attempted > 0) {
        this.logger.log(
          `Daily CFDI Retry: ${result.attempted} intentadas, ${result.stamped} timbradas, ${result.failed} fallidas`,
        );
      }
    } catch (error) {
      this.logger.error(`Daily CFDI Retry failed: ${(error as Error).message}`);
    }
  }
}
