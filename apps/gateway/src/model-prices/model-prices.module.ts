import { Module } from '@nestjs/common';
import { ModelPricesService } from './model-prices.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [ModelPricesService],
  exports: [ModelPricesService],
})
export class ModelPricesModule {}
