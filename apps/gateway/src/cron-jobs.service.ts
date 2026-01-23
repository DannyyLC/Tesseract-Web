import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from './database/prisma.service';

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
    // Auto-close inactive conversations
    // Condition: Active status, Inactive for > 24 hours, Last message from USER
    const inactivityThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

    const result = await this.prisma.conversation.updateMany({
      where: {
        status: 'active',
        lastMessageAt: { lt: inactivityThreshold },
        lastMessageRole: { not: 'user' }, // Close if AI/System had the last word (user abandoned)
      },
      data: {
        status: 'closed',
        closedAt: new Date(),
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
}
