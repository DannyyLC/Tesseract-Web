import { ApiResponseBuilder, CursorPaginatedResponse } from '@workflow-automation/shared-types';
import { InvoiceService } from '../../invoice.service';
import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { DashboardInvoiceDto } from '@/invoice/dto/dashboard-invoice.dto';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { User } from '@workflow-platform/database';
import { UserPayload } from '../../../common/types/jwt-payload.type';

@Controller('invoice')
@UseGuards(JwtAuthGuard)
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Get('dashboard')
  async getDashboardData(
    @CurrentUser() user: UserPayload,
    @Query('cursor') cursor: string | null = null,
    @Query('pageSize') pageSize: number = 10,
    @Query('action') action: 'next' | 'prev' | null = null,
    @Res() res: Response,
  ): Promise<Response<ApiResponseBuilder<CursorPaginatedResponse<DashboardInvoiceDto>>>> {
    const result = await this.invoiceService.getDashboardData(user.organizationId, cursor, pageSize, action);
    const apiResponse = new ApiResponseBuilder<CursorPaginatedResponse<DashboardInvoiceDto>>();
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
