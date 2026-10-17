import { Injectable } from '@nestjs/common';
import { MetaTransporter } from './meta.transporter';
import { YCloudTransporter } from './ycloud.transporter';
import { IWBTransporter, WBTransporterClass, WhatsAppProvider } from './wb-transporter.interface';

/**
 * Registro de transporters por proveedor. El `satisfies` es lo que obliga a cada clase a
 * declarar `static api_base_url`: una interfaz no puede exigir miembros estáticos.
 */
const TRANSPORTER_CLASSES = {
  ycloud: YCloudTransporter,
  meta: MetaTransporter,
} satisfies Record<WhatsAppProvider, WBTransporterClass>;

/** Elige el transporter según `WhatsAppConfig.provider`. */
@Injectable()
export class WBTransporterResolver {
  private readonly transporters: Record<WhatsAppProvider, IWBTransporter>;

  constructor(ycloud: YCloudTransporter, meta: MetaTransporter) {
    this.transporters = { ycloud, meta };
  }

  forProvider(provider: string): IWBTransporter {
    if (!Object.hasOwn(TRANSPORTER_CLASSES, provider)) {
      throw new Error(`Proveedor de WhatsApp no soportado: '${provider}'`);
    }
    return this.transporters[provider as WhatsAppProvider];
  }
}
