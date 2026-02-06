import { Module } from '@nestjs/common';
import { TenantToolService } from './tenant-tool.service';
import { TenantToolController } from './controllers/user-ui/tenant-tool.controller';
import { UtilityModule } from '../utility/utility.module';

@Module({
  imports: [
    UtilityModule
  ],
  providers: [TenantToolService],
  controllers: [TenantToolController],
})
export class TenantToolModule {}
