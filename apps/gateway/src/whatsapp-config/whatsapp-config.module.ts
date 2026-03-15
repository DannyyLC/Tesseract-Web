import { Module } from '@nestjs/common';
import { WhatsappConfigService } from './whatsapp-config.service';
import { WhatsappConfigController } from './controllers/user-ui/whatsapp-config.controller';
import { UtilityModule } from '../utility/utility.module';
import { HttpModule } from '@nestjs/axios';
import { WorkflowsModule } from '../workflows/workflows.module';

@Module({
  imports: [
    UtilityModule,
    HttpModule,
    WorkflowsModule
  ],
  providers: [WhatsappConfigService],
  controllers: [WhatsappConfigController],
})
export class WhatsappConfigModule {}
