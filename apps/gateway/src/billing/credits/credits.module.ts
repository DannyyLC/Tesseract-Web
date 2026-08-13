import { Module } from '@nestjs/common';
import { CreditsService } from './credits.service';
import { UtilityModule } from '@/platform/utility/utility.module';
import { CreditsAdminController } from './controllers/admin/credits.admin.controller';

@Module({
  imports: [UtilityModule],
  providers: [CreditsService],
  exports: [CreditsService],
  controllers: [CreditsAdminController],
})
export class CreditsModule {}
