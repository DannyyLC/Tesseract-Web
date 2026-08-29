import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Facturapi from 'facturapi';

/**
 * Cliente del PAC (Facturapi), el proveedor autorizado que timbra los CFDI ante el SAT.
 *
 * La API key decide el entorno: las que empiezan por `sk_test_` operan contra el sandbox y
 * emiten facturas de mentira; las `sk_live_` timbran de verdad y **consumen timbres de pago**.
 * No hay bandera de entorno que valga: si la llave de producción está en un `.env` de
 * desarrollo, se emiten CFDI reales ante el SAT que después hay que cancelar.
 *
 * ## Sin llave, arranca igual
 *
 * A diferencia de `StripeClient`, aquí no se lanza en `onModuleInit`. Stripe es el cobro: sin
 * él la aplicación no tiene sentido y es correcto que no levante. El PAC solo hace falta para
 * facturar a clientes mexicanos, y tumbar el gateway entero por eso deja sin entorno local a
 * cualquiera que no tenga cuenta de Facturapi —incluido quien clona el repo por primera vez—
 * para una funcionalidad que quizá ni va a tocar.
 *
 * La garantía se mantiene donde importa: `FACTURAPI_API_KEY` está en `REQUIRED_IN_PRODUCTION`
 * ([env-validation.ts](../../platform/config/env-validation.ts)), así que en producción el
 * proceso muere antes de que Nest arranque. Lo que se relaja es solo el desarrollo local, y el
 * intento de timbrar sin llave falla como `INTERNAL` — el mismo camino que un PAC caído, que
 * ya está contemplado: la factura queda pendiente, se reintenta de noche y llega la alerta.
 */
@Injectable()
export class FacturapiClient implements OnModuleInit {
  private readonly logger = new Logger(FacturapiClient.name);
  private client: Facturapi | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const apiKey = this.configService.get<string>('FACTURAPI_API_KEY');

    if (!apiKey) {
      this.logger.warn(
        'FACTURAPI_API_KEY no está configurada: el timbrado de CFDI quedará deshabilitado',
      );
      return;
    }

    this.client = new Facturapi(apiKey);
  }

  /**
   * Instancia del SDK, o error si no hay llave.
   *
   * El mensaje es explícito a propósito: quien lo vea en un log de desarrollo tiene que
   * entender que le falta configuración, no que el PAC rechazó algo.
   */
  get facturapi(): Facturapi {
    if (!this.client) {
      throw new Error(
        'FACTURAPI_API_KEY is not configured; CFDI stamping is unavailable in this environment',
      );
    }
    return this.client;
  }

  /** Si el timbrado está operativo. Permite avisar sin provocar un error. */
  get isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * Si la facturación fiscal está habilitada.
   *
   * Distinto de `isConfigured`: aquello describe si hay llave, esto si queremos usarla. Apagada,
   * ninguna ruta llega al PAC y las facturas se quedan en PENDING sin intentos ni errores, que es
   * el estado del que el barrido nocturno las recoge tal cual el día que se vuelva a encender.
   *
   * Se apaga con `CFDI_ENABLED="false"` y nada más: ausente o con cualquier otro valor queda
   * habilitada, para no cambiar el comportamiento de los entornos que no la declaran.
   */
  get isEnabled(): boolean {
    return this.configService.get<string>('CFDI_ENABLED') !== 'false';
  }

  /** `true` cuando se está operando contra el sandbox. */
  get isTestMode(): boolean {
    return (this.configService.get<string>('FACTURAPI_API_KEY') ?? '').startsWith('sk_test');
  }

  get customers() {
    return this.facturapi.customers;
  }

  get invoices() {
    return this.facturapi.invoices;
  }
}
