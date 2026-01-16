import { Module } from '@nestjs/common';
import { CreditsService } from './credits.service';
import { DatabaseModule } from '../database/database.module';
import { CreditsController } from './controllers/user-ui/credits.controller';

@Module({
  imports: [DatabaseModule],
  providers: [CreditsService],
  exports: [CreditsService],
  controllers: [CreditsController],
})
export class CreditsModule {}
