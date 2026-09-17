import { Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { HttpStatusCode } from 'axios';
import { ApiResponse, ApiResponseBuilder, PendingAnnouncementDto } from '@tesseract/types';
import { JwtAuthGuard } from '@/identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/identity/auth/guards/roles.guard';
import { CurrentUser } from '@/identity/auth/decorators/current-user.decorator';
import { UserPayload } from '@/platform/common/types/jwt-payload.type';
import { AnnouncementsReadService } from '../../announcements.read.service';

@Controller('announcements')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnnouncementsController {
  constructor(private readonly announcementsReadService: AnnouncementsReadService) {}

  @Get('pending')
  async getPending(
    @CurrentUser() user: UserPayload,
    @Res() res: Response,
    @Query('locale') locale = 'es',
  ): Promise<Response<ApiResponse<PendingAnnouncementDto[]>>> {
    const apiResponse = new ApiResponseBuilder<PendingAnnouncementDto[]>();
    const pending = await this.announcementsReadService.getPending(
      user.sub,
      user.organizationId,
      locale,
    );
    apiResponse
      .setStatusCode(HttpStatusCode.Ok)
      .setMessage('Pending announcements retrieved successfully')
      .setData(pending);
    return res.status(HttpStatusCode.Ok).json(apiResponse.build());
  }

  @Post(':userNotificationId/dismiss')
  async dismiss(
    @CurrentUser() user: UserPayload,
    @Param('userNotificationId') userNotificationId: string,
    @Res() res: Response,
  ): Promise<Response> {
    const apiResponse = new ApiResponseBuilder<void>();
    await this.announcementsReadService.dismiss(userNotificationId, user.sub, user.organizationId);
    apiResponse.setStatusCode(HttpStatusCode.Ok).setMessage('Announcement dismissed');
    return res.status(HttpStatusCode.Ok).json(apiResponse.build());
  }

  @Post(':userNotificationId/cta-click')
  async ctaClick(
    @CurrentUser() user: UserPayload,
    @Param('userNotificationId') userNotificationId: string,
    @Res() res: Response,
  ): Promise<Response> {
    const apiResponse = new ApiResponseBuilder<void>();
    await this.announcementsReadService.registerCtaClick(
      userNotificationId,
      user.sub,
      user.organizationId,
    );
    apiResponse.setStatusCode(HttpStatusCode.Ok).setMessage('CTA click registered');
    return res.status(HttpStatusCode.Ok).json(apiResponse.build());
  }
}
