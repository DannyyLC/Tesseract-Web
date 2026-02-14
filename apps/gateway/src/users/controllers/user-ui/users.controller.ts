import { UsersService } from '../../users.service';
import { 
  Controller, 
  Get, 
  Query, 
  Res, 
  UseGuards, 
  Param, 
  Patch, 
  Delete, 
  Body, 
  ParseIntPipe, 
  DefaultValuePipe 
} from '@nestjs/common';
import { Response } from 'express';
import { 
  DashboardUserDataDto, 
  LeaveOrganizationDto, 
  UpdateUserDto, 
  UserDetailDto 
} from '../../dto';
import {
  ApiResponse,
  ApiResponseBuilder,
  CursorPaginatedResponse,
} from '@workflow-automation/shared-types';
import { HttpStatusCode } from 'axios';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { UserPayload } from '../../../common/types/jwt-payload.type';
import { NotificationEventDto } from '../../../events/app-notifications/notification.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('dashboard')
  async getDashboardData(
    @CurrentUser() user: UserPayload,
    @Res() res: Response,
    @Query('cursor') cursor: string | null = null,
    @Query('pageSize', new DefaultValuePipe(10), ParseIntPipe) pageSize: number,
    @Query('action') action: 'next' | 'prev' | null = null,
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('isActive') isActive?: string,
  ): Promise<Response<ApiResponse<CursorPaginatedResponse<DashboardUserDataDto>>>> {
    const apiResponse = new ApiResponseBuilder<CursorPaginatedResponse<DashboardUserDataDto>>();
    const result = await this.usersService.getDashboardData(
      user.organizationId,
      cursor,
      pageSize,
      action,
      {
        search,
        role,
        isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      },
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

  @Get('stats')
  async getStats(@CurrentUser() user: UserPayload, @Res() res: Response): Promise<Response> {
    const apiResponse = new ApiResponseBuilder<any>();
    const stats = await this.usersService.getStats(user.organizationId);
    apiResponse
      .setStatusCode(HttpStatusCode.Ok)
      .setMessage('User statistics retrieved successfully')
      .setData(stats);
    return res.status(HttpStatusCode.Ok).json(apiResponse.build());
  }

  @Get(':id')
  async getById(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<Response> {
    const apiResponse = new ApiResponseBuilder<UserDetailDto>();
    const foundUser = await this.usersService.findOne(id, user.organizationId);

    const userDetail = new UserDetailDto({
      id: foundUser.id,
      name: foundUser.name,
      email: foundUser.email,
      role: foundUser.role,
      isActive: foundUser.isActive,
      avatar: foundUser.avatar,
      timezone: foundUser.timezone,
      lastLoginAt: foundUser.lastLoginAt,
      createdAt: foundUser.createdAt,
      emailVerified: foundUser.emailVerified,
    });

    apiResponse
      .setStatusCode(HttpStatusCode.Ok)
      .setMessage('User details retrieved successfully')
      .setData(userDetail);
    return res.status(HttpStatusCode.Ok).json(apiResponse.build());
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Res() res: Response,
  ): Promise<Response> {
    const apiResponse = new ApiResponseBuilder<any>();
    let updatedUser;

    // 1. Update Role if provided
    if (updateUserDto.role) {
      updatedUser = await this.usersService.updateRole(
        id,
        user.organizationId,
        updateUserDto.role,
        user.sub,
      );
    }

    // 2. Update Status if provided
    if (updateUserDto.isActive !== undefined) {
      if (updateUserDto.isActive) {
        updatedUser = await this.usersService.activate(id, user.organizationId, user.sub);
      } else {
        updatedUser = await this.usersService.deactivate(id, user.organizationId, user.sub);
      }
    }

    // If nothing updated (e.g. empty body), just fetch the user to return current state
    if (!updatedUser) {
      updatedUser = await this.usersService.findOne(id, user.organizationId);
    }

    apiResponse
      .setStatusCode(HttpStatusCode.Ok)
      .setMessage('User updated successfully')
      .setData(updatedUser);
    return res.status(HttpStatusCode.Ok).json(apiResponse.build());
  }

  @Patch(':id/transfer-ownership')
  async transferOwnership(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<Response> {
    const apiResponse = new ApiResponseBuilder<void>();
    await this.usersService.transferOwnership(user.sub, id, user.organizationId);
    apiResponse.setStatusCode(HttpStatusCode.Ok).setMessage('User ownership transferred successfully');
    return res.status(HttpStatusCode.Ok).json(apiResponse.build());
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<Response> {
    const apiResponse = new ApiResponseBuilder<void>();
    await this.usersService.remove(id, user.organizationId, user.sub);
    apiResponse.setStatusCode(HttpStatusCode.Ok).setMessage('User deleted successfully');
    return res.status(HttpStatusCode.Ok).json(apiResponse.build());
  }

  @Delete('me/organization')
  async leaveOrganization(
    @CurrentUser() user: UserPayload,
    @Body() dto: LeaveOrganizationDto,
    @Res() res: Response,
  ): Promise<Response> {
    const apiResponse = new ApiResponseBuilder<{ message: string }>();
    
    const result = await this.usersService.leaveOrganization(
      user.sub,
      user.organizationId,
      dto.confirmationText,
      dto.code2FA,
    );

    apiResponse
      .setStatusCode(HttpStatusCode.Ok)
      .setMessage(result.message)
      .setData(result);
    
    return res.status(HttpStatusCode.Ok).json(apiResponse.build());
  }

  @Get('notifications')
  async getAppNotifications(
      @CurrentUser() user: UserPayload,
      @Res() res: Response
    ): Promise<Response<ApiResponse<NotificationEventDto[]>>> {
      const apiResponse = new ApiResponseBuilder<NotificationEventDto[]>();
      const notifications = await this.usersService.getNotificationsForUser(user.organizationId);
      apiResponse
        .setStatusCode(HttpStatusCode.Ok)
        .setMessage('User notifications retrieved successfully')
        .setData(notifications);
      return res.status(HttpStatusCode.Ok).json(apiResponse.build());
  }
}
