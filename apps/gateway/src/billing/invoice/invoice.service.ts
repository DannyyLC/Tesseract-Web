import { PrismaService } from '@/platform/database/prisma.service';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { DashboardInvoiceDto } from './dto/dashboard-invoice.dto';
import { DEFAULT_PAGE_SIZE, PaginatedResponse } from '@tesseract/types';
import { CursorPaginatedResponseUtils } from '@/platform/common/responses/cursor-paginated-response';
import { CloudStorageService } from '@/platform/cloud/storage/cloud-storage.service';
import { CfdiNotFoundException } from '@/platform/common/exceptions';

@Injectable()
export class InvoiceService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly storage: CloudStorageService,
    private readonly configService: ConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  async getDashboardData(
    organizationId: string,
    cursor: string | null = null,
    pageSize = DEFAULT_PAGE_SIZE,
    action: 'next' | 'prev' | null = null,
  ): Promise<PaginatedResponse<DashboardInvoiceDto> | null> {
    const invoices = await this.prismaService.invoice.findMany({
      where: { organizationId },
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      take: action === 'next' || action === null ? pageSize + 1 : -(pageSize + 1),
      select: {
        id: true,
        invoiceNumber: true,
        type: true,
        status: true,
        periodStart: true,
        periodEnd: true,
        subtotal: true,
        overageAmount: true,
        tax: true,
        total: true,
        stripeHostedUrl: true,
        stripePdfUrl: true,
        paidAt: true,
        dueAt: true,
        cfdiStatus: true,
        cfdiUuid: true,
        cfdiStampedAt: true,
        cfdiErrorKind: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!invoices) {
      this.logger.error(
        `getDashboardData method >> No invoices found for organization ${organizationId}`,
      );
      return null;
    }
    const paginatedData = await CursorPaginatedResponseUtils.getInstance().build(
      invoices.map((invoice) => ({
        ...invoice,
        subtotal: invoice.subtotal.toNumber(),
        overageAmount: invoice.overageAmount.toNumber(),
        tax: invoice.tax.toNumber(),
        total: invoice.total.toNumber(),
      })),
      pageSize,
      action,
    );

    return paginatedData;
  }

  /**
   * Devuelve el XML o el PDF de un CFDI ya timbrado.
   *
   * El archivo se sirve **a través del Gateway** y no con una URL firmada de GCS. Pesa unos
   * pocos KB, así que hacer de tubería no cuesta nada, y a cambio la autorización queda donde
   * está la del resto de la aplicación: el guard del controlador y esta comprobación de
   * organización. Una URL firmada es una credencial que descarga sin autenticarse y que acaba
   * en el historial del navegador y en los logs de cualquier proxy por el que pase.
   *
   * La comprobación de `organizationId` en el `where` no es redundante con el guard: el guard
   * dice quién eres, esto dice que la factura es tuya.
   */
  async getCfdiFile(
    organizationId: string,
    invoiceId: string,
    format: 'xml' | 'pdf',
  ): Promise<{ contents: Buffer; filename: string; contentType: string }> {
    const invoice = await this.prismaService.invoice.findFirst({
      where: { id: invoiceId, organizationId },
      select: {
        invoiceNumber: true,
        cfdiUuid: true,
        cfdiXmlPath: true,
        cfdiPdfPath: true,
      },
    });

    const objectPath = format === 'xml' ? invoice?.cfdiXmlPath : invoice?.cfdiPdfPath;

    if (!invoice?.cfdiUuid || !objectPath) {
      throw new CfdiNotFoundException(invoiceId);
    }

    const bucket = this.configService.get<string>('CFDI_STORAGE_BUCKET') ?? '';
    const contents = await this.storage.download(bucket, objectPath);

    return {
      contents,
      filename: `${invoice.invoiceNumber}.${format}`,
      contentType: format === 'xml' ? 'application/xml' : 'application/pdf',
    };
  }
}
