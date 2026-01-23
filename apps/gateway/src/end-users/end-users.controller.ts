import { Controller, Param, Res } from '@nestjs/common';
import { EndUsersService } from './end-users.service';
import { Request, Response } from 'express';
import {
  ApiResponse,
  ApiResponseBuilder,
  PaginatedResponse,
} from '@workflow-automation/shared-types';
import { DashboardEndUserDto } from './dto/dashboard-end-user.dto';

@Controller('end-users')
export class EndUsersController {
  constructor(private readonly endUsersService: EndUsersService) {}

  async getDashboardData(
    @Param('idOrganization') idOrganization: string,
    @Param('initPage') initPage: number = 1,
    @Param('pageSize') pageSize: number = 10,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<PaginatedResponse<DashboardEndUserDto>>>> {
    const apiResponse = new ApiResponseBuilder<PaginatedResponse<DashboardEndUserDto>>();
    const result = await this.endUsersService.getDashboardData(idOrganization, initPage, pageSize);
    const paginatedResponse: PaginatedResponse<DashboardEndUserDto> = {
      items: result.items,
      totalItems: result.items.length,
      totalPages: result.totalPages,
      currentPage: initPage,
      pageSize: pageSize,
    };
    apiResponse
      .setData(paginatedResponse)
      .setMessage('Dashboard end users data retrieved successfully')
      .setSuccess(true);
    return res.status(200).json(apiResponse.build());
  }
}
