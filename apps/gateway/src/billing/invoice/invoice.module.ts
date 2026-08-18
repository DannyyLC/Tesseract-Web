import { Module } from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { InvoiceController } from './controllers/user-ui/invoice.controller';
import { UtilityModule } from '@/platform/utility/utility.module';
import { NotificationsModule } from '@/messaging/notifications/notifications.module';
import { CloudStorageModule } from '@/platform/cloud/storage/cloud-storage.module';
import { CfdiService } from './cfdi.service';
import { CfdiRetryService } from './cfdi-retry.service';
import { FacturapiClient } from './facturapi.client';

/**
 * Facturas y su CFDI.
 *
 * Se exportan tres piezas porque las consumen desde fuera: `CfdiService` lo llama el webhook
 * de Stripe (para timbrar en cuanto se cobra), `CfdiRetryService` lo dispara el cron nocturno
 * y `FacturapiClient` lo usa el perfil fiscal para validar el RFC contra el padrón del SAT.
 */
@Module({
  imports: [UtilityModule, NotificationsModule, CloudStorageModule],
  providers: [InvoiceService, CfdiService, CfdiRetryService, FacturapiClient],
  controllers: [InvoiceController],
  exports: [CfdiService, CfdiRetryService, FacturapiClient],
})
export class InvoiceModule {}
