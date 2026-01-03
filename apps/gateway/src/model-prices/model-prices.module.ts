import { Module } from '@nestjs/common';
import { ModelPricesService } from './model-prices.service';
import { PrismaModule } from '../database/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ModelPricesService],
  exports: [ModelPricesService],
})
export class ModelPricesModule {}
