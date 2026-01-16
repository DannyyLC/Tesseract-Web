import { ApiResponseBuilder } from '@workflow-automation/shared-types';
import { InvoiceService } from '../../invoice.service';
import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { DashboardInvoiceDto } from '@/invoice/dto/dashboard-invoice.dto';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';

@Controller('invoice')
@UseGuards(JwtAuthGuard)
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Get('dashboard/:organizationId')
  async getDashboardData(
    @Param('organizationId') organizationId: string,
    @Res() res: Response,
  ): Promise<Response<ApiResponseBuilder<DashboardInvoiceDto[]>>> {
    const result = await this.invoiceService.getDashboardData(organizationId);
    const apiResponse = new ApiResponseBuilder<DashboardInvoiceDto[]>();
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
}
