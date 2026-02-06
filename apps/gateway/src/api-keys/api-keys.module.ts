import { Module } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { ApiKeysController } from './controllers/user-ui/api-keys.controller';
import { UtilityModule } from '../utility/utility.module';

@Module({
  imports: [UtilityModule],
  controllers: [ApiKeysController],
  providers: [ApiKeysService],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}
