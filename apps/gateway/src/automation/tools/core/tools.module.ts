import { Module } from '@nestjs/common';
import { ToolsService } from './tools.service';
import { KmsService } from './kms.service';
import { SecretFieldsCipher } from './secret-fields-cipher.service';
import { DatabaseModule } from '@/platform/database/database.module';
import { ToolsOauthController } from './tools-oauth.controller';
import { ToolsOauthService } from './tools-oauth.service';
import { ToolHealthService } from './tool-health.service';
import { UtilityModule } from '@/platform/utility/utility.module';

@Module({
  imports: [DatabaseModule, UtilityModule],
  controllers: [ToolsOauthController],
  providers: [ToolsService, KmsService, SecretFieldsCipher, ToolsOauthService, ToolHealthService],
  exports: [ToolsService, KmsService, SecretFieldsCipher, ToolHealthService],
})
export class ToolsModule {}
