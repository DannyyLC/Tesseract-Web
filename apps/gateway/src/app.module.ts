import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { WinstonModule } from 'nest-winston';
import { buildWinstonOptions } from './platform/logging/winston.config';
import { IdentityModule } from './identity/identity.module';
import { BillingModule } from './billing/billing.module';
import { AutomationModule } from './automation/automation.module';
import { MessagingModule } from './messaging/messaging.module';
import { PlatformModule } from './platform/platform.module';
import { GoogleDriveModule } from './platform/cloud/google-drive/google-drive.module';

const isProduction = process.env.NODE_ENV === 'production';

@Module({
  imports: [
    // La config vive en platform/logging para poder cubrirla con un spec: que exista y
    // sea correcta no basta, hay que comprobar que la aplicación pasa por ella.
    WinstonModule.forRoot(buildWinstonOptions(isProduction)),
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
    PlatformModule,
    IdentityModule,
    BillingModule,
    AutomationModule,
    MessagingModule,
    GoogleDriveModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [WinstonModule],
})
export class AppModule {}
