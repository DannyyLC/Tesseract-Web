import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiResponseBuilder, CursorPaginatedResponse, UserRole } from '@tesseract/types';
import { Response } from 'express';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { UserPayload } from '../../../common/types/jwt-payload.type';
import { DashboardInvoiceDto } from '../../../invoice/dto/dashboard-invoice.dto';
import { InvoiceService } from '../../invoice.service';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import { Roles } from '../../../auth/decorators/roles.decorator';

@Controller('invoice')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Get('dashboard')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  async getDashboardData(
    @CurrentUser() user: UserPayload,
    @Query('cursor') cursor: string | null = null,
    @Query('pageSize') pageSize = 10,
    @Query('action') action: 'next' | 'prev' | null = null,
    @Res() res: Response,
  ): Promise<Response<ApiResponseBuilder<CursorPaginatedResponse<DashboardInvoiceDto>>>> {
    const result = await this.invoiceService.getDashboardData(
      user.organizationId,
      cursor,
      pageSize,
      action,
    );
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
