import { PrismaService } from '../database/prisma.service';
import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { DashboardInvoiceDto } from './dto/dashboard-invoice.dto';

@Injectable()
export class InvoiceService {
    constructor(
        private readonly prismaService: PrismaService,
        @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    ){}

    async getDashboardData(organizationId: string): Promise<DashboardInvoiceDto[] | null> {
        const invoices = await this.prismaService.invoice.findMany({
            where: { organizationId },
            select: {
                id: true,
                organizationId: true,
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
            this.logger.error(`getDashboardData method >> No invoices found for organization ${organizationId}`);
            return null;
        }
        return invoices;
    }
}
