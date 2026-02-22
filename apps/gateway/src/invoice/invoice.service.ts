import { PrismaService } from '../database/prisma.service';
import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { DashboardInvoiceDto } from './dto/dashboard-invoice.dto';
import { CursorPaginatedResponse } from '@tesseract/types';
import { CursorPaginatedResponseUtils } from '../common/responses/cursor-paginated-response';

@Injectable()
export class InvoiceService {
  constructor(
    private readonly prismaService: PrismaService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  async getDashboardData(
    organizationId: string,
    cursor: string | null = null,
    pageSize = 10,
    action: 'next' | 'prev' | null = null,
  ): Promise<CursorPaginatedResponse<DashboardInvoiceDto> | null> {
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
      invoices,
      pageSize,
      action,
    );

    return paginatedData;
  }
}
