import { UsersService } from '../../../users.service';
import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { DashboardUsersDto } from '../../../dto/dashboard-users.dto';
import { ApiResponseBuilder } from '@workflow-automation/shared-types';
import { JwtAuthGuard } from '../../../../auth/guards/jwt-auth.guard';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('dashboard/:organizationId')
  async getDashboardData(
    @Param('organizationId') organizationId: string,
    @Res() res: Response,
  ): Promise<Response<ApiResponseBuilder<DashboardUsersDto>>> {
    const apiResponse = new ApiResponseBuilder<DashboardUsersDto>();
    const result = await this.usersService.getDashboardData(organizationId);
    if (result.users.length === 0) {
      apiResponse.setStatusCode(404).setMessage('No user data found for the organization');
      return res.status(404).json(apiResponse.build());
    } else {
      apiResponse
        .setStatusCode(200)
        .setMessage('User dashboard data retrieved successfully')
        .setData(result);
      return res.status(200).json(apiResponse.build());
    }
  }
}
