import { Module } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { ApiKeysController } from './controllers/user-ui/api-keys.controller';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [ApiKeysController],
  providers: [ApiKeysService],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}
