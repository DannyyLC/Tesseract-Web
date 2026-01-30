import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { ExecutionsModule } from './executions/executions.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { OrganizationsModule } from './organizations/organizations.module';
// import { SecretsModule } from './secrets/secrets.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ConversationsModule } from './conversations/conversations.module';
import { EventsModule } from './events/events.module';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import 'winston-daily-rotate-file';
import { BillingModule } from './billing/billing.module';
import { InvoiceModule } from './invoice/invoice.module';
import { UsersModule } from './users/users.module';
import { ScheduleModule } from '@nestjs/schedule';
import { CronJobsService } from './cron-jobs.service';
import { EndUsersModule } from './end-users/end-users.module';
import { AuthService } from './auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import { TenantToolModule } from './tenant-tool/tenant-tool.module';
import { PrismaService } from './database/prisma.service';

@Global()
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
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        '.env', // En apps/gateway/.env
        '../../.env', // En la raíz del monorepo
      ],
      ignoreEnvFile: false,
    }),

    DatabaseModule,
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
  ],
  controllers: [],
  providers: [CronJobsService, AuthService, JwtService, PrismaService],
  exports: [WinstonModule, AuthService],
})
export class AppModule { }
