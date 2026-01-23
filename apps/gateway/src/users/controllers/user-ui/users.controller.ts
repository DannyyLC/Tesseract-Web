import { UsersService } from '../../users.service';
import { Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { DashboardUserDataDto, DashboardUsersDto } from '../../dto/dashboard-users.dto';
import { ApiResponse, ApiResponseBuilder, CursorPaginatedResponse } from '@workflow-automation/shared-types';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { HttpStatusCode } from 'axios';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('dashboard/:organizationId')
  async getDashboardData(
    @Param('organizationId') organizationId: string,
    @Res() res: Response,
    @Query('cursor') cursor: string | null = null,
    @Query('pageSize') pageSize: number = 10,
    @Query('action') action: 'next' | 'prev' | null = null,
  ): Promise<Response<ApiResponse<CursorPaginatedResponse<DashboardUserDataDto>>>> {
    const apiResponse = new ApiResponseBuilder<CursorPaginatedResponse<DashboardUserDataDto>>();
    const result = await this.usersService.getDashboardData(
      organizationId,
      cursor,
      pageSize,
      action
    );
    if (result.items.length === 0) {
      apiResponse.setStatusCode(404).setMessage('No user data found for the organization');
      return res.status(HttpStatusCode.NotFound).json(apiResponse.build());
    } else {
      apiResponse
        .setStatusCode(HttpStatusCode.Ok)
        .setMessage('User dashboard data retrieved successfully')
        .setData(result);
      return res.status(200).json(apiResponse.build());
    }
  }
}
