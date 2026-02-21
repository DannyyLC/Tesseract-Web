import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { AuthModule } from './auth/auth.module';
import { ExecutionsModule } from './executions/executions.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { ScheduleModule } from '@nestjs/schedule';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import 'winston-daily-rotate-file';
import { BillingModule } from './billing/billing.module';
import { ConversationsModule } from './conversations/conversations.module';
import { CronJobsService } from './cron-jobs.service';
import { EndUsersModule } from './end-users/end-users.module';
import { EventsModule } from './events/events.module';
import { InvoiceModule } from './invoice/invoice.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TenantToolModule } from './tenant-tool/tenant-tool.module';
import { UsersModule } from './users/users.module';
import { UtilityModule } from './utility/utility.module';
import { ToolsCatalogModule } from './tools-catalog/tools-catalog.module';
import { ToolsModule } from './tools/tools.module';

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
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 10,
    }]),
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
    EventsModule,
    BillingModule,
    InvoiceModule,
    UsersModule,
    ScheduleModule.forRoot(),
    EndUsersModule,
    EventEmitterModule.forRoot(),
    TenantToolModule,
    UtilityModule,
    ToolsCatalogModule,
    ToolsModule
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
