import { Module } from '@nestjs/common';
import { UtilityService } from './utility.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [
    DatabaseModule,
  ],
  providers: [UtilityService],
  exports: [UtilityService],
})
export class UtilityModule {}
