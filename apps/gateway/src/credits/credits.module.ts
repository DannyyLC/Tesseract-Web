import { Module } from '@nestjs/common';
import { CreditsService } from './credits.service';
import { UtilityModule } from '../utility/utility.module';

@Module({
  imports: [UtilityModule],
  providers: [CreditsService],
  exports: [CreditsService],
  controllers: [],
})
export class CreditsModule {}
