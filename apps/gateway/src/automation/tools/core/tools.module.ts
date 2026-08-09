import { Module } from '@nestjs/common';
import { ToolsService } from './tools.service';
import { KmsService } from './kms.service';
import { DatabaseModule } from '@/platform/database/database.module';
import { ToolsOauthController } from './tools-oauth.controller';
import { ToolsOauthService } from './tools-oauth.service';
import { ToolHealthService } from './tool-health.service';
import { UtilityModule } from '@/platform/utility/utility.module';

@Module({
  imports: [DatabaseModule, UtilityModule],
  controllers: [ToolsOauthController],
  providers: [ToolsService, KmsService, ToolsOauthService, ToolHealthService],
  exports: [ToolsService, KmsService, ToolHealthService],
})
export class ToolsModule {}
