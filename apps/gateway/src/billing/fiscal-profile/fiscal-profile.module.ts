import { Module } from '@nestjs/common';
import { FiscalProfileService } from './fiscal-profile.service';
import { FiscalProfileController } from './controllers/user-ui/fiscal-profile.controller';
import { InvoiceModule } from '../invoice/invoice.module';

/**
 * Datos fiscales de la organización (RFC, régimen, domicilio) con los que se emite el CFDI.
 *
 * Importa `InvoiceModule` por el `FacturapiClient`: los datos se validan contra el padrón del
 * SAT a través del PAC antes de guardarlos.
 */
@Module({
  imports: [InvoiceModule],
  providers: [FiscalProfileService],
  controllers: [FiscalProfileController],
  exports: [FiscalProfileService],
})
export class FiscalProfileModule {}
