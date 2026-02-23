import { Module } from '@nestjs/common';
import { ToolsService } from './tools.service';
import { KmsService } from './kms.service';
import { DatabaseModule } from '../../database/database.module';
import { ToolsOauthController } from './tools-oauth.controller';
import { ToolsOauthService } from './tools-oauth.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ToolsOauthController],
  providers: [ToolsService, KmsService, ToolsOauthService],
  exports: [ToolsService],
})
export class ToolsModule {}
