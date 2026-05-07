import { Module } from '@nestjs/common';
import { WorkflowsModule } from '../workflows/workflows.module';
import { CronTriggersController } from './cron-triggers.controller';
import { CronTriggersService } from './cron-triggers.service';

@Module({
  imports: [WorkflowsModule],
  controllers: [CronTriggersController],
  providers: [CronTriggersService],
  exports: [CronTriggersService],
})
export class CronTriggersModule {}
