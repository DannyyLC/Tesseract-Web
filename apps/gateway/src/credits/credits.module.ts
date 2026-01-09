import { Module } from '@nestjs/common';
import { CreditsService } from './credits.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [CreditsService],
  exports: [CreditsService],
})
export class CreditsModule {}
