import { Module } from '@nestjs/common';
import { CreditsService } from './credits.service';
import { CreditsController } from './controllers/user-ui/credits.controller';
import { UtilityModule } from '../utility/utility.module';

@Module({
  imports: [UtilityModule],
  providers: [CreditsService],
  exports: [CreditsService],
  controllers: [CreditsController],
})
export class CreditsModule {}
