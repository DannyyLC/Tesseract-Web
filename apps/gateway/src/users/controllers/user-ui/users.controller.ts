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
  DefaultValuePipe, 
  Post
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
} from '@tesseract/types';
import { HttpStatusCode } from 'axios';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { UserPayload } from '../../../common/types/jwt-payload.type';
import { NotificationEventDto } from '../../../events/app-notifications/notification.dto';
import { UpdateProfileDto } from '../../dto';
import { ServiceInfoRequestDto } from '../../../users/dto/service-info-request.dto';
import { Throttle } from '@nestjs/throttler';

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

  @Get('notifications')
  async getAppNotifications(
      @CurrentUser() user: UserPayload,
      @Res() res: Response,
      @Query('cursor') cursor: string | null = null,
      @Query('pageSize', new DefaultValuePipe(10), ParseIntPipe) pageSize: number
    ): Promise<Response<ApiResponse<CursorPaginatedResponse<NotificationEventDto>>>> {
      const apiResponse = new ApiResponseBuilder<CursorPaginatedResponse<NotificationEventDto>>();
      // Cast to any if needed or ensure service returns strict match
      const notifications = await this.usersService.getNotificationsForUser(user.sub, user.organizationId, cursor, pageSize);
      apiResponse
        .setStatusCode(HttpStatusCode.Ok)
        .setMessage('User notifications retrieved successfully')
        .setData(notifications);
      return res.status(HttpStatusCode.Ok).json(apiResponse.build());
  }

  @Get('notifications/unread-count')
  async getUnreadNotificationsCount(
      @CurrentUser() user: UserPayload,
      @Res() res: Response,
    ): Promise<Response<ApiResponse<number>>> {
      const apiResponse = new ApiResponseBuilder<number>();
      const count = await this.usersService.getUnreadNotificationsCount(user.sub, user.organizationId);
      apiResponse
        .setStatusCode(HttpStatusCode.Ok)
        .setMessage('User unread notifications count retrieved successfully')
        .setData(count);
      return res.status(HttpStatusCode.Ok).json(apiResponse.build());
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

  @Patch(':id/update-status-or-role')
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

  @Patch(':id/update-profile')
  async updateProfile(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() updateProfileDto: UpdateProfileDto,
    @Res() res: Response,
  ): Promise<Response> {
    const apiResponse = new ApiResponseBuilder<any>();
    const updatedUser = await this.usersService.updateProfile(id, user.organizationId, updateProfileDto);
    if (!updatedUser) {
      apiResponse
        .setMessage('User not found or profile update failed')
        .setSuccess(false)
        .setStatusCode(HttpStatusCode.NotFound);
      return res.status(HttpStatusCode.NotFound).json(apiResponse.build());
    }

    apiResponse
      .setStatusCode(HttpStatusCode.Ok)
      .setMessage('User profile updated successfully')
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

  @Patch('notifications/:id/read')
  async markNotificationAsRead(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Res() res: Response
  ): Promise<Response> {
    const apiResponse = new ApiResponseBuilder<void>();
    await this.usersService.markNotificationAsRead(user.sub, user.organizationId, id);
    apiResponse.setStatusCode(HttpStatusCode.Ok).setMessage('Notification marked as read');
    return res.status(HttpStatusCode.Ok).json(apiResponse.build());
  }

  @Patch('notifications/read-all')
  async markAllNotificationsAsRead(
    @CurrentUser() user: UserPayload,
    @Res() res: Response
  ): Promise<Response> {
    const apiResponse = new ApiResponseBuilder<void>();
    await this.usersService.markAllNotificationsAsRead(user.sub, user.organizationId);
    apiResponse.setStatusCode(HttpStatusCode.Ok).setMessage('All notifications marked as read');
    return res.status(HttpStatusCode.Ok).json(apiResponse.build());
  }

  @Delete('notifications/:id')
  async deleteNotification(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Res() res: Response
  ): Promise<Response> {
    const apiResponse = new ApiResponseBuilder<void>();
    await this.usersService.deleteNotification(user.sub, user.organizationId, id);
    apiResponse.setStatusCode(HttpStatusCode.Ok).setMessage('Notification deleted successfully');
    return res.status(HttpStatusCode.Ok).json(apiResponse.build());
  }

  @Post('request-service-info-by-email')
  @Throttle({ default: { limit: 1, ttl: 60000 } })
  async requestServiceInfoByEmail(
    @CurrentUser() user: UserPayload,
    @Body() message: ServiceInfoRequestDto,
    @Res() res: Response
  ): Promise<Response<ApiResponse<boolean>>> {
    const apiResponse = new ApiResponseBuilder<boolean>();
    const userMsg = message.userMsg || 'El usuario no proporcionó ningún mensaje adicional.';
    const emailResult = await this.usersService.requestServiceInfoByEmail(user.name, user.email, message.subject, userMsg, user.organizationId);
    if (!emailResult) {
      apiResponse
        .setMessage('Failed to send service information request email')
        .setSuccess(false)
        .setStatusCode(HttpStatusCode.InternalServerError);
      return res.status(HttpStatusCode.InternalServerError).json(apiResponse.build());
    }

    apiResponse
      .setMessage('Service information request email sent successfully')
      .setSuccess(true)
      .setStatusCode(HttpStatusCode.Ok);
    return res.status(HttpStatusCode.Ok).json(apiResponse.build());
  }
}
