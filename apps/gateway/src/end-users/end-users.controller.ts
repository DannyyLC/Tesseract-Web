import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { EndUsersService } from './end-users.service';
import { Request, Response } from 'express';
import {
  ApiResponse,
  ApiResponseBuilder,
  PaginatedResponse,
} from '@tesseract/types';
import { DashboardEndUserDto } from './dto/dashboard-end-user.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserPayload } from '../common/types/jwt-payload.type';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('end-users')
@UseGuards(JwtAuthGuard)
export class EndUsersController {
  constructor(private readonly endUsersService: EndUsersService) {}

  @Get('dashboard')
  async getDashboardData(
    @CurrentUser() user: UserPayload,
    @Query('cursor') cursor: string | null = null,
    @Query('pageSize') pageSize = 10,
    @Query('paginationAction') paginationAction: 'next' | 'prev' | null = null,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<PaginatedResponse<DashboardEndUserDto>>>> {
    const apiResponse = new ApiResponseBuilder<PaginatedResponse<DashboardEndUserDto>>();
    const result = await this.endUsersService.getDashboardData(
      user.organizationId,
      cursor,
      pageSize,
      paginationAction,
    );
    apiResponse
      .setData(result)
      .setMessage('Dashboard end users data retrieved successfully')
      .setSuccess(true);
    return res.status(200).json(apiResponse.build());
  }
}
