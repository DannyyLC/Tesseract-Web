import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ApiKeysModule } from './identity/api-keys/api-keys.module';
import { AuthModule } from './identity/auth/auth.module';
import { ExecutionsModule } from '@/automation/executions/executions.module';
import { OrganizationsModule } from './identity/organizations/organizations.module';
import { WorkflowsModule } from './automation/workflows/workflows.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import 'winston-daily-rotate-file';
import { BillingModule } from './billing/billing.module';
import { ConversationsModule } from './messaging/conversations/conversations.module';
import { CronJobsService } from './cron-jobs.service';
import { EndUsersModule } from './identity/end-users/end-users.module';
import { NotificationsModule } from './messaging/notifications/notifications.module';
import { TenantToolModule } from './automation/tools/tenant/tenant-tool.module';
import { UsersModule } from '@/identity/users/users.module';
import { UtilityModule } from '@/platform/utility/utility.module';
import { ToolsCatalogModule } from './automation/tools/catalog/tools-catalog.module';
import { ToolsModule } from './automation/tools/core/tools.module';
import { WhatsappConfigModule } from './messaging/channels/whatsapp-config/whatsapp-config.module';
import { CronTriggersModule } from './automation/cron-triggers/cron-triggers.module';

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
    AuthModule,
    OrganizationsModule,
    ConversationsModule,
    WorkflowsModule,
    ExecutionsModule,
    ApiKeysModule,
    NotificationsModule,
    BillingModule,
    UsersModule,
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    EndUsersModule,
    TenantToolModule,
    UtilityModule,
    ToolsCatalogModule,
    ToolsModule,
    WhatsappConfigModule,
    CronTriggersModule,
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
