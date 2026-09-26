import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ToolsService } from './tools.service';
import { KmsService } from './kms.service';
import { DatabaseModule } from '@/platform/database/database.module';
import { ToolsOauthController } from './tools-oauth.controller';
import { ToolsOauthService } from './tools-oauth.service';
import { ToolHealthService } from './tool-health.service';
import { UtilityModule } from '@/platform/utility/utility.module';
import { WebhookDedupModule } from '@/platform/webhooks/webhook-dedup.module';
import { OauthStateService } from './oauth-state.service';

@Module({
  // `JwtModule.register({})` sin secreto: el `state` se firma con el suyo (ver OauthStateService).
  imports: [DatabaseModule, UtilityModule, WebhookDedupModule, JwtModule.register({})],
  controllers: [ToolsOauthController],
  providers: [ToolsService, KmsService, ToolsOauthService, ToolHealthService, OauthStateService],
  exports: [ToolsService, KmsService, ToolHealthService],
})
export class ToolsModule {}
