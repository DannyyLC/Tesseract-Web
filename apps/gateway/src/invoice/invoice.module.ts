import { Module } from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { InvoiceController } from './controllers/user-ui/invoice.controller';

@Module({
  providers: [InvoiceService],
  controllers: [InvoiceController],
})
export class InvoiceModule {}
