import { Module } from '@nestjs/common';
import { ToolsService } from './tools.service';
import { KmsService } from './kms.service';
import { DatabaseModule } from '../database/database.module';
import { ToolsController } from './tools.controller';
import { ToolsOauthController } from './tools-oauth.controller';
import { ToolsOauthService } from './tools-oauth.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ToolsController, ToolsOauthController],
  providers: [ToolsService, KmsService, ToolsOauthService],
  exports: [ToolsService],
})
export class ToolsModule {}
