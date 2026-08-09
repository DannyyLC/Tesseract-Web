import { Module } from '@nestjs/common';
import { TenantToolService } from './tenant-tool.service';
import { TenantToolController } from './controllers/user-ui/tenant-tool.controller';
import { UtilityModule } from '@/platform/utility/utility.module';
import { ToolsModule } from '../core/tools.module';

@Module({
  imports: [UtilityModule, ToolsModule],
  providers: [TenantToolService],
  controllers: [TenantToolController],
})
export class TenantToolModule {}
