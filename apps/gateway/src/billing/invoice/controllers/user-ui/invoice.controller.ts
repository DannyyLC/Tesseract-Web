import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiResponseBuilder,
  DEFAULT_PAGE_SIZE,
  PaginatedResponse,
  UserRole,
} from '@tesseract/types';
import { CfdiStatus } from '@tesseract/database';
import { Response } from 'express';
import { CurrentUser } from '@/identity/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/identity/auth/guards/jwt-auth.guard';
import { UserPayload } from '@/platform/common/types/jwt-payload.type';
import { DashboardInvoiceDto } from '../../dto/dashboard-invoice.dto';
import { InvoiceService } from '../../invoice.service';
import { CfdiService } from '../../cfdi.service';
import { RolesGuard } from '@/identity/auth/guards/roles.guard';
import { Roles } from '@/identity/auth/decorators/roles.decorator';
import { PrismaService } from '@/platform/database/prisma.service';
import { CfdiDisabledException, CfdiNotStampableException } from '@/platform/common/exceptions';
import { FacturapiClient } from '../../facturapi.client';

@Controller('invoice')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InvoiceController {
  constructor(
    private readonly invoiceService: InvoiceService,
    private readonly cfdiService: CfdiService,
    private readonly facturapiClient: FacturapiClient,
    private readonly prisma: PrismaService,
  ) {}

  @Get('dashboard')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  async getDashboardData(
    @CurrentUser() user: UserPayload,
    @Query('cursor') cursor: string | null = null,
    @Query('pageSize', new DefaultValuePipe(DEFAULT_PAGE_SIZE), ParseIntPipe) pageSize: number,
    @Query('action') action: 'next' | 'prev' | null = null,
    @Res() res: Response,
  ): Promise<Response<ApiResponseBuilder<PaginatedResponse<DashboardInvoiceDto>>>> {
    const result = await this.invoiceService.getDashboardData(
      user.organizationId,
      cursor,
      pageSize,
      action,
    );
    const apiResponse = new ApiResponseBuilder<PaginatedResponse<DashboardInvoiceDto>>();
    if (!result) {
      apiResponse.setStatusCode(404).setMessage('No invoices found for the specified organization');
      return res.status(404).json(apiResponse.build());
    } else {
      apiResponse
        .setStatusCode(200)
        .setMessage('Invoice dashboard data retrieved successfully')
        .setData(result);
      return res.status(200).json(apiResponse.build());
    }
  }

  /**
   * Genera el CFDI de una factura a petición del cliente.
   *
   * Existe para el caso en que el timbrado automático falló por datos fiscales incorrectos:
   * el cliente los corrige y vuelve a intentarlo sin esperar al barrido nocturno.
   *
   * El throttle es bajo a propósito. Cada timbrado consume un timbre de pago ante el PAC, así
   * que un botón pulsado con insistencia cuesta dinero real aunque `stampInvoice` impida el
   * duplicado fiscal.
   */
  @Post(':id/cfdi')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async generateCfdi(
    @CurrentUser() user: UserPayload,
    @Param('id') invoiceId: string,
    @Res() res: Response,
  ): Promise<Response> {
    // Se corta aquí y no solo en `stampInvoice`: aquella devuelve `skipped` cuando está apagada,
    // y este endpoint traduce `skipped` a un 200 de "CFDI generado". El cliente vería éxito sobre
    // una factura que nadie timbró.
    if (!this.facturapiClient.isEnabled) {
      throw new CfdiDisabledException();
    }

    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId: user.organizationId },
      select: { id: true, cfdiStatus: true },
    });

    const apiResponse = new ApiResponseBuilder<{ cfdiStatus: string }>();

    if (!invoice) {
      apiResponse.setStatusCode(404).setMessage('Invoice not found');
      return res.status(404).json(apiResponse.build());
    }

    // Se rechaza antes de tocar el PAC: reintentar una factura ya timbrada emitiría un
    // segundo CFDI para un solo pago, y una en STAMPING está siendo timbrada ahora mismo.
    if (
      invoice.cfdiStatus !== CfdiStatus.PENDING &&
      invoice.cfdiStatus !== CfdiStatus.FAILED
    ) {
      throw new CfdiNotStampableException(invoiceId, invoice.cfdiStatus);
    }

    const result = await this.cfdiService.stampInvoice(invoiceId);

    if (result.status === 'failed') {
      apiResponse
        .setStatusCode(422)
        .setMessage(result.message ?? 'CFDI stamping failed')
        .setData({ cfdiStatus: CfdiStatus.FAILED });
      return res.status(422).json(apiResponse.build());
    }

    apiResponse
      .setStatusCode(200)
      .setMessage('CFDI generated successfully')
      .setData({ cfdiStatus: CfdiStatus.STAMPED });
    return res.status(200).json(apiResponse.build());
  }

  /**
   * Descarga el XML o el PDF del CFDI.
   *
   * El XML es el documento con valor fiscal —es lo que el contador del cliente carga en su
   * contabilidad—; el PDF es solo su representación impresa.
   */
  @Get(':id/cfdi/:format')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  async downloadCfdi(
    @CurrentUser() user: UserPayload,
    @Param('id') invoiceId: string,
    @Param('format') format: string,
    @Res() res: Response,
  ): Promise<void> {
    const normalized = format === 'xml' ? 'xml' : 'pdf';

    const file = await this.invoiceService.getCfdiFile(
      user.organizationId,
      invoiceId,
      normalized,
    );

    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.contents);
  }
}
