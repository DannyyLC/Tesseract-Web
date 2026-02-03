import { Module } from '@nestjs/common';
import { TenantToolService } from './tenant-tool.service';
import { TenantToolController } from './controllers/user-ui/tenant-tool.controller';

@Module({
  providers: [TenantToolService],
  controllers: [TenantToolController],
})
export class TenantToolModule {}
