import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { EndUsersService } from '../end-users.service';
import { Response } from 'express';
import {
  ApiResponse,
  ApiResponseBuilder,
  PaginatedResponse,
  UserRole,
  DashboardEndUserDto,
} from '@tesseract/types';
import { CurrentUser } from '@/identity/auth/decorators/current-user.decorator';
import { UserPayload } from '@/platform/common/types/jwt-payload.type';
import { JwtAuthGuard } from '@/identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/identity/auth/guards/roles.guard';
import { Roles } from '@/identity/auth/decorators/roles.decorator';
import { QueryEndUsersDto } from '../dto/query-end-users.dto';
import { BlockEndUserDto } from '../dto/block-end-user.dto';

@Controller('end-users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EndUsersController {
  constructor(private readonly endUsersService: EndUsersService) {}

  @Get('dashboard')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  async getDashboardData(
    @CurrentUser() user: UserPayload,
    @Query() query: QueryEndUsersDto,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<PaginatedResponse<DashboardEndUserDto>>>> {
    const apiResponse = new ApiResponseBuilder<PaginatedResponse<DashboardEndUserDto>>();
    const result = await this.endUsersService.getDashboardData(
      user.organizationId,
      query.cursor ?? null,
      query.pageSize ?? 10,
      query.paginationAction ?? null,
      { search: query.search, blocked: query.blocked },
    );
    apiResponse
      .setData(result)
      .setMessage('Dashboard end users data retrieved successfully')
      .setSuccess(true);
    return res.status(200).json(apiResponse.build());
  }

  /**
   * Bloquear y desbloquear quedan fuera de `VIEWER` a propósito: dejan de llegar mensajes de
   * un cliente real, que es una decisión de operación, no de consulta.
   */
  @Post(':id/block')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async block(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() body: BlockEndUserDto,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<DashboardEndUserDto>>> {
    const apiResponse = new ApiResponseBuilder<DashboardEndUserDto>();
    const result = await this.endUsersService.block(
      user.organizationId,
      id,
      user.sub,
      body.reason,
    );
    apiResponse.setData(result).setMessage('End user blocked successfully').setSuccess(true);
    return res.status(200).json(apiResponse.build());
  }

  @Post(':id/unblock')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async unblock(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<DashboardEndUserDto>>> {
    const apiResponse = new ApiResponseBuilder<DashboardEndUserDto>();
    const result = await this.endUsersService.unblock(user.organizationId, id);
    apiResponse.setData(result).setMessage('End user unblocked successfully').setSuccess(true);
    return res.status(200).json(apiResponse.build());
  }
}
