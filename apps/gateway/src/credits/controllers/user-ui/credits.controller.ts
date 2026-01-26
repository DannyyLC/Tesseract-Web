import { CreditsService } from '../../credits.service';
import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiResponseBuilder } from '@workflow-automation/shared-types';
import { DashboardCreditsDto } from '../../dto/dashboard-credits.dto';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { UserPayload } from '../../../common/types/jwt-payload.type';

@Controller('credits')
@UseGuards(JwtAuthGuard)
export class CreditsController {
  constructor(private readonly creditsService: CreditsService) {}

  @Get('dashboard')
  async getDashboardData(
    @CurrentUser() user: UserPayload,
    @Query('cursor') cursor: string | null = null,
    @Query('pageSize') pageSize: number = 10,
    @Query('action') action: 'next' | 'prev' | null = null,
    @Res() res: Response,
  ): Promise<Response> {
    const apiResponse = new ApiResponseBuilder<DashboardCreditsDto>();
    const result = await this.creditsService.getDashboardData(user.organizationId);
    if (!result) {
      apiResponse.setStatusCode(404).setMessage('No credit data found for the organization');
      return res.status(404).json(apiResponse.build());
    } else {
      apiResponse
        .setStatusCode(200)
        .setMessage('Credit dashboard data retrieved successfully')
        .setData(result);
      return res.status(200).json(apiResponse.build());
    }
  }
}
