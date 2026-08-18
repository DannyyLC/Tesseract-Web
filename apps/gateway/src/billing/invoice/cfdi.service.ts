import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { CfdiErrorKind, CfdiStatus, Invoice } from '@tesseract/database';
import { PrismaService } from '@/platform/database/prisma.service';
import { CloudStorageService } from '@/platform/cloud/storage/cloud-storage.service';
import { FacturapiClient } from './facturapi.client';
import {
  CFDI_CURRENCY,
  CFDI_PAYMENT_FORM_CARD,
  CFDI_PAYMENT_METHOD,
  CFDI_PRICES_INCLUDE_TAX,
  CFDI_PRODUCT_KEY,
  CFDI_TYPE_INCOME,
  CFDI_UNIT_KEY,
  CFDI_UNIT_NAME,
  CFDI_IVA_RATE,
} from './cfdi.constants';

/** Resultado de un intento de timbrado, para que el llamador sepa qué reportar. */
export interface StampResult {
  status: 'stamped' | 'skipped' | 'failed';
  /** Presente cuando falló. */
  errorKind?: CfdiErrorKind;
  message?: string;
}

/**
 * Campos del error del PAC que delatan que el problema está en los datos del receptor y no
 * en nuestra configuración.
 *
 * La clasificación importa porque decide dos cosas: si el cron reintenta (con datos malos
 * reintentaría eternamente) y si al cliente se le ofrece un botón o solo un aviso.
 */
const CLIENT_DATA_HINTS = [
  'tax_id',
  'legal_name',
  'tax_system',
  'zip',
  'customer',
  'rfc',
  'receptor',
];

@Injectable()
export class CfdiService {
  private readonly bucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly facturapiClient: FacturapiClient,
    private readonly storage: CloudStorageService,
    private readonly configService: ConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {
    this.bucket = this.configService.get<string>('CFDI_STORAGE_BUCKET') ?? '';
  }

  /**
   * Timbra una factura ante el SAT. Idempotente.
   *
   * ## Por qué se reclama la fila antes de llamar al PAC
   *
   * Dos procesos pueden querer timbrar la misma factura a la vez: el webhook de Stripe, el
   * cron de reintentos y el botón del panel son tres caminos hacia aquí. Si los tres llaman
   * a Facturapi, se emiten tres CFDI válidos para un solo pago, y deshacer eso significa
   * cancelar ante el SAT — el trámite que todo este diseño existe para evitar.
   *
   * El `updateMany` condicionado al estado es un compare-and-swap: solo uno de los tres verá
   * `count === 1` y seguirá adelante. Los otros dos salen sin hacer nada.
   *
   * ## Por qué eso no basta
   *
   * Si el proceso muere entre la llamada al PAC y el guardado, la factura queda emitida en
   * Facturapi y la fila en STAMPING. El cron la recoge una hora después y volvería a
   * timbrarla. Por eso se manda `idempotency_key` con el id de la factura local: Facturapi
   * reconoce la repetición y devuelve la factura que ya existía en lugar de crear otra.
   * La unicidad de `cfdiUuid` en la base es la tercera red, por si fallaran las dos primeras.
   */
  async stampInvoice(invoiceId: string): Promise<StampResult> {
    const claimed = await this.prisma.invoice.updateMany({
      where: {
        id: invoiceId,
        cfdiStatus: { in: [CfdiStatus.PENDING, CfdiStatus.FAILED] },
      },
      data: {
        cfdiStatus: CfdiStatus.STAMPING,
        cfdiAttempts: { increment: 1 },
        cfdiLastAttemptAt: new Date(),
      },
    });

    if (claimed.count !== 1) {
      this.logger.info(
        `stampInvoice >> Factura ${invoiceId} no reclamable (ya timbrada o en curso), se omite`,
      );
      return { status: 'skipped' };
    }

    return this.stampClaimedInvoice(invoiceId);
  }

  /**
   * Retoma una factura que quedó en STAMPING de un intento anterior.
   *
   * Se llama solo desde el cron y solo pasada la ventana de gracia. No vuelve a reclamar
   * —ya está reclamada— pero sí actualiza el contador de intentos.
   */
  async resumeStalledInvoice(invoiceId: string): Promise<StampResult> {
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { cfdiAttempts: { increment: 1 }, cfdiLastAttemptAt: new Date() },
    });
    return this.stampClaimedInvoice(invoiceId);
  }

  private async stampClaimedInvoice(invoiceId: string): Promise<StampResult> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { organization: { select: { country: true, fiscalProfile: true } } },
    });

    if (!invoice) {
      this.logger.error(`stampClaimedInvoice >> Factura ${invoiceId} no encontrada`);
      return { status: 'skipped' };
    }

    const profile = invoice.organization.fiscalProfile;

    if (!profile?.facturapiCustomerId || !profile.validatedAt) {
      await this.markFailed(
        invoiceId,
        CfdiErrorKind.CLIENT_DATA,
        'La organización no tiene datos fiscales validados',
      );
      return {
        status: 'failed',
        errorKind: CfdiErrorKind.CLIENT_DATA,
        message: 'Datos fiscales incompletos',
      };
    }

    try {
      const created = await this.facturapiClient.invoices.create({
        customer: profile.facturapiCustomerId,
        type: CFDI_TYPE_INCOME,
        use: profile.cfdiUse,
        payment_form: this.resolvePaymentForm(),
        payment_method: CFDI_PAYMENT_METHOD,
        currency: CFDI_CURRENCY,
        // El id local viaja en dos campos con propósitos distintos: `idempotency_key` evita
        // el duplicado si reintentamos, `external_id` permite rastrear la factura desde el
        // panel de Facturapi hasta nuestra base.
        idempotency_key: invoice.id,
        external_id: invoice.id,
        items: this.buildItems(invoice),
      });

      const [xml, pdf] = await Promise.all([
        this.toBuffer(await this.facturapiClient.invoices.downloadXml(created.id)),
        this.toBuffer(await this.facturapiClient.invoices.downloadPdf(created.id)),
      ]);

      const year = new Date().getUTCFullYear();
      const basePath = `cfdi/${invoice.organizationId}/${year}/${invoice.id}`;

      await Promise.all([
        this.storage.upload(this.bucket, `${basePath}.xml`, xml, 'application/xml'),
        this.storage.upload(this.bucket, `${basePath}.pdf`, pdf, 'application/pdf'),
      ]);

      await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          cfdiStatus: CfdiStatus.STAMPED,
          cfdiUuid: created.uuid,
          facturapiId: created.id,
          cfdiStampedAt: new Date(),
          cfdiFolioNumber:
            typeof created.folio_number === 'number' ? created.folio_number : undefined,
          cfdiXmlPath: `${basePath}.xml`,
          cfdiPdfPath: `${basePath}.pdf`,
          cfdiError: null,
          cfdiErrorKind: null,
        },
      });

      this.logger.info(
        `stampClaimedInvoice >> Factura ${invoiceId} timbrada con folio fiscal ${created.uuid}`,
      );
      return { status: 'stamped' };
    } catch (error) {
      const kind = this.classifyError(error);
      const message = this.describeError(error);

      await this.markFailed(invoiceId, kind, message);

      this.logger.error(
        `stampClaimedInvoice >> Falló el timbrado de ${invoiceId} (${kind}): ${message}`,
      );
      return { status: 'failed', errorKind: kind, message };
    }
  }

  private async markFailed(
    invoiceId: string,
    kind: CfdiErrorKind,
    message: string,
  ): Promise<void> {
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        cfdiStatus: CfdiStatus.FAILED,
        cfdiErrorKind: kind,
        // Se recorta porque los errores del PAC llegan con el detalle completo de validación
        // y no hace falta guardar párrafos en una columna que solo se lee para diagnosticar.
        cfdiError: message.slice(0, 1000),
      },
    });
  }

  /**
   * Conceptos de la factura.
   *
   * Va un solo concepto con el total cobrado. Desglosar la suscripción y el overage en dos
   * líneas sería más fiel, pero el SAT valida que la suma de los conceptos cuadre al centavo
   * con el total, y repartir el IVA entre dos líneas con redondeo hacia dentro produce
   * descuadres de un centavo que rechazan el timbrado.
   */
  private buildItems(invoice: Invoice) {
    const total = invoice.total.toNumber();
    const period = this.describePeriod(invoice);

    return [
      {
        quantity: 1,
        product: {
          description: `Suscripción Tesseract${period}`,
          product_key: CFDI_PRODUCT_KEY,
          unit_key: CFDI_UNIT_KEY,
          unit_name: CFDI_UNIT_NAME,
          price: total,
          tax_included: CFDI_PRICES_INCLUDE_TAX,
          taxes: [{ type: 'IVA', rate: CFDI_IVA_RATE }],
        },
      },
    ];
  }

  private describePeriod(invoice: Invoice): string {
    if (!invoice.periodStart || !invoice.periodEnd) return '';
    const format = (date: Date) => date.toISOString().slice(0, 10);
    return ` (${format(invoice.periodStart)} a ${format(invoice.periodEnd)})`;
  }

  /**
   * Forma de pago del CFDI.
   *
   * Hoy todo cobro entra por Stripe Checkout con tarjeta, así que siempre es 04. Se aísla en
   * un método para que añadir la transferencia —cuando se facture un cobro manual— sea un
   * cambio de una línea y no una búsqueda por todo el servicio.
   */
  private resolvePaymentForm(): string {
    return CFDI_PAYMENT_FORM_CARD;
  }

  /**
   * De quién es la culpa del fallo.
   *
   * Ante la duda, INTERNAL. Equivocarse hacia ese lado significa que nos llega una alerta y
   * lo miramos; equivocarse hacia CLIENT_DATA significa decirle al cliente que corrija unos
   * datos que están bien, mientras nosotros no nos enteramos de nada.
   */
  private classifyError(error: unknown): CfdiErrorKind {
    const status = (error as { status?: number })?.status;

    // 401/403 llave inválida, 402 sin timbres, 5xx caída del PAC: nada que el cliente pueda
    // hacer.
    if (!status || status >= 500 || status === 401 || status === 403 || status === 402) {
      return CfdiErrorKind.INTERNAL;
    }

    const haystack = JSON.stringify({
      message: (error as Error)?.message ?? '',
      errors: (error as { errors?: unknown })?.errors ?? [],
    }).toLowerCase();

    return CLIENT_DATA_HINTS.some((hint) => haystack.includes(hint))
      ? CfdiErrorKind.CLIENT_DATA
      : CfdiErrorKind.INTERNAL;
  }

  private describeError(error: unknown): string {
    const details = (error as { errors?: { message?: string }[] })?.errors;
    if (Array.isArray(details) && details.length > 0) {
      return details.map((detail) => detail.message ?? '').join('; ');
    }
    return (error as Error)?.message ?? 'Error desconocido';
  }

  /**
   * Normaliza la descarga del PAC a un Buffer.
   *
   * El SDK devuelve un `Blob` o un stream de Node según el entorno de ejecución, así que hay
   * que cubrir los dos.
   */
  private async toBuffer(download: unknown): Promise<Buffer> {
    if (download && typeof (download as Blob).arrayBuffer === 'function') {
      return Buffer.from(await (download as Blob).arrayBuffer());
    }

    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = download as NodeJS.ReadableStream;
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk as Buffer)));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }
}
