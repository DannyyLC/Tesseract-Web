import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { EndUsersService } from './end-users.service';
import { Response } from 'express';
import {
  ApiResponse,
  ApiResponseBuilder,
  PaginatedResponse,
  UserRole,
  DashboardEndUserDto,
} from '@tesseract/types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserPayload } from '../common/types/jwt-payload.type';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('end-users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EndUsersController {
  constructor(private readonly endUsersService: EndUsersService) {}

  @Get('dashboard')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
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
