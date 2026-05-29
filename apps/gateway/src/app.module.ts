import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import 'winston-daily-rotate-file';
import { CronJobsService } from './cron-jobs.service';
import { IdentityModule } from './identity/identity.module';
import { BillingModule } from './billing/billing.module';
import { AutomationModule } from './automation/automation.module';
import { MessagingModule } from './messaging/messaging.module';
import { PlatformModule } from './platform/platform.module';

@Module({
  imports: [
    WinstonModule.forRoot({
      transports: [
        new winston.transports.DailyRotateFile({
          filename: 'logs/app-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          zippedArchive: false,
          maxSize: '20m',
          maxFiles: '14d',
          level: 'info',
        }),
        new winston.transports.Console(),
      ],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 20,
      },
    ]),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        '.env', // En apps/gateway/.env
        '../../.env', // En la raíz del monorepo
      ],
      ignoreEnvFile: false,
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    PlatformModule,
    IdentityModule,
    BillingModule,
    AutomationModule,
    MessagingModule,
  ],
  controllers: [],
  providers: [
    CronJobsService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [WinstonModule],
})
export class AppModule {}
