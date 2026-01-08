import { Module } from '@nestjs/common';
import { CreditsService } from './credit.service';

@Module({
  providers: [CreditsService],
  exports: [CreditsService],
})
export class CreditsModule {}
