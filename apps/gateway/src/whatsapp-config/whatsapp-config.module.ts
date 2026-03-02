import { Module } from '@nestjs/common';
import { WhatsappConfigService } from './whatsapp-config.service';
import { WhatsappConfigController } from './controllers/user-ui/whatsapp-config.controller';
import { UtilityModule } from '@/utility/utility.module';

@Module({
  imports: [
    UtilityModule
  ],
  providers: [WhatsappConfigService],
  controllers: [WhatsappConfigController],
})
export class WhatsappConfigModule {}
