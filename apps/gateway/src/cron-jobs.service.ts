import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from './database/prisma.service';

@Injectable()
export class CronJobsService {
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
}