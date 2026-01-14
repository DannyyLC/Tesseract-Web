import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import * as winston from 'winston';
import 'winston-daily-rotate-file';

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
    SubscriptionsModule
  ],
  controllers: [],
  providers: [],
  exports: [WinstonModule]
})
export class AppModule {}
