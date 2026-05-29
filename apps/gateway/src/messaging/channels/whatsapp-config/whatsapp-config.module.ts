import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { UtilityModule } from '@/platform/utility/utility.module';
import { WorkflowsModule } from '@/automation/workflows/workflows.module';
import { WhatsappConfigController } from './controllers/user-ui/whatsapp-config.controller';
import { WhatsappConfigService } from './whatsapp-config.service';

@Module({
  imports: [UtilityModule, HttpModule, WorkflowsModule],
  providers: [WhatsappConfigService],
  controllers: [WhatsappConfigController],
  exports: [WhatsappConfigService],
})
export class WhatsappConfigModule {}
