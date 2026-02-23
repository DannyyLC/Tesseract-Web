import { Module } from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { InvoiceController } from './controllers/user-ui/invoice.controller';
import { UtilityModule } from '../utility/utility.module';

@Module({
  imports: [UtilityModule],
  providers: [InvoiceService],
  controllers: [InvoiceController],
})
export class InvoiceModule {}
