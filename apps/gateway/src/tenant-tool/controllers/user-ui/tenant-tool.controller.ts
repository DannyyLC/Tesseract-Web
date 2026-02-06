import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { TenantToolService } from '../../../tenant-tool/tenant-tool.service';
import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { UserPayload } from '../../../common/types/jwt-payload.type';
import { Response } from 'express';
import { ApiResponseBuilder, CursorPaginatedResponse } from '@workflow-automation/shared-types';
import { DashboardTenantToolDto } from '../../../tenant-tool/dto/dashboard-tenant-tool.dto';
@Controller('tenant-tool')
@UseGuards(JwtAuthGuard)
export class TenantToolController {
  constructor(private readonly tenantToolService: TenantToolService) {}

  @Get('dashboard')
  async getDashboardData(
    @CurrentUser() user: UserPayload,
    @Query('cursor') cursor: string | null = null,
    @Query('pageSize') pageSize = 10,
    @Query('action') action: 'next' | 'prev' | null = null,
    @Res() res: Response,
  ): Promise<Response<CursorPaginatedResponse<DashboardTenantToolDto>>> {
    const apiResponse = new ApiResponseBuilder<CursorPaginatedResponse<DashboardTenantToolDto>>();
    const result = await this.tenantToolService.getDashboardData(
      user.organizationId,
      cursor,
      pageSize,
      action,
    );
    apiResponse
      .setData(result)
      .setMessage('Dashboard tenant tool data retrieved successfully')
      .setSuccess(true);
    return res.status(200).json(apiResponse.build());
  }
}
