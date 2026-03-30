import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from './database/prisma.service';
import { ConversationStatus, ChatRole } from '@tesseract/database';

@Injectable()
export class CronJobsService {
  private readonly logger = new Logger(CronJobsService.name);

  constructor(private readonly prisma: PrismaService) {}

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
}
