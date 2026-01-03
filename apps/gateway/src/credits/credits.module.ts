import { Module } from '@nestjs/common';
import { CreditBalanceService } from './credit-balance.service';

@Module({
  providers: [CreditBalanceService],
  exports: [CreditBalanceService],
})
export class CreditsModule {}
