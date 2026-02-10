import { Body, Controller, Get, Param, Patch, Post, Query, Res, UseGuards, Delete } from '@nestjs/common';
import { ApiResponse, ApiResponseBuilder } from '@workflow-automation/shared-types';
import { Organization } from '@workflow-platform/database';
import { Response } from 'express';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { UserPayload } from '../../../common/types/jwt-payload.type';
import { InviteUserErrorsDto } from '../../../users/dto/invite-user-errors.dto';
import {
  DashboardOrganizationDto,
  UpdateOrganizationDto,
} from '../../dto';
import { OrganizationsService } from '../../organizations.service';
import { DashboardUserDataDto } from '../../../users/dto';
import { ApiBearerAuth } from '@nestjs/swagger';
@Controller('organizations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService
  ) {}

  @Get('dashboard/:id')
  async getDashboardData(
    @Res() res: Response,
    @Param('id') id: string,
  ): Promise<Response<ApiResponseBuilder<DashboardOrganizationDto>>> {
    const apiResponse = new ApiResponseBuilder<DashboardOrganizationDto>();
    const result = await this.organizationsService.getDashboardData(id);

    if (!result) {
      apiResponse
        .setStatusCode(404)
        .setMessage('Seems Like the organization does not exist anymore');
      return res.status(404).json(apiResponse.build());
    } else {
      apiResponse
        .setStatusCode(200)
        .setMessage('Dashboard data retrieved successfully')
        .setData(result);
      return res.status(200).json(apiResponse.build());
    }
  }

  @Patch('update')
  async updateOrganization(
    @Query('id') id: string,
    @Body() body: UpdateOrganizationDto,
    @Res() res: Response,
  ): Promise<Response<ApiResponseBuilder<Organization>>> {
    const result = await this.organizationsService.update(id, body);
    const apiResponse = new ApiResponseBuilder<Organization>();
    if (!result) {
      apiResponse.setStatusCode(400).setMessage('Organization could not be updated');
      return res.status(400).json(apiResponse.build());
    } else {
      apiResponse
        .setStatusCode(200)
        .setMessage('Organization updated successfully')
        .setData(result);
      return res.status(200).json(apiResponse.build());
    }
  }

  @Delete('delete')
  async deleteOrganization(
    @CurrentUser() user: UserPayload,
    @Res() res: Response
  ): Promise<Response<ApiResponseBuilder<Organization>>> {
    const result = await this.organizationsService.softDelete(user.organizationId, user.sub);
    const apiResponse = new ApiResponseBuilder<Organization>();
    if (!result) {
      apiResponse.setStatusCode(400).setMessage('Organization could not be deleted');
      return res.status(400).json(apiResponse.build());
    } else {
      apiResponse
        .setStatusCode(200)
        .setMessage('Organization deleted successfully')
        .setData(result);
      return res.status(200).json(apiResponse.build());
    }
  }

  @Post('invite-user')
  async inviteUser(
    @CurrentUser() user: UserPayload,
    @Body() body: { email: string },
    @Res() res: Response,
  ): Promise<Response<ApiResponseBuilder<boolean | keyof typeof InviteUserErrorsDto>>> {
    const apiResponse = new ApiResponseBuilder<boolean | keyof typeof InviteUserErrorsDto>();
    const result = await this.organizationsService.invite(user.organizationId, body.email);
    if (typeof result !== 'string') {
      apiResponse.setStatusCode(200).setMessage('User invited successfully').setData(result);
      return res.status(200).json(apiResponse.build());
    } else {
      apiResponse.setStatusCode(400).setMessage('User invitation failed').setErrors([result]);
      return res.status(400).json(apiResponse.build());
    }
  }

  @Post('resend-invitation')
  async resendInvitation(
    @CurrentUser() user: UserPayload,
    @Body() body: { email: string },
    @Res() res: Response,
  ): Promise<Response<ApiResponseBuilder<boolean>>> {
    const apiResponse = new ApiResponseBuilder<boolean>();
    const result = await this.organizationsService.resendInvitation(body.email,user.organizationId);
    if (result) {
      apiResponse.setStatusCode(200).setMessage('Invitation resent successfully').setData(result);
      return res.status(200).json(apiResponse.build());
    } else {
      apiResponse.setStatusCode(400).setMessage('Invitation could not be resent').setData(result);
      return res.status(400).json(apiResponse.build());
    }
  }

  @Post('cancel-invitation')
  async cancelInvitation(
    @Body() body: { email: string },
    @Res() res: Response,
  ): Promise<Response<ApiResponseBuilder<boolean>>> {
    const apiResponse = new ApiResponseBuilder<boolean>();
    const result = await this.organizationsService.cancelInvitation(body.email);
    if (result) {
      apiResponse
        .setStatusCode(200)
        .setMessage('Invitation cancelled successfully')
        .setData(result);
      return res.status(200).json(apiResponse.build());
    } else {
      apiResponse
        .setStatusCode(400)
        .setMessage('Invitation could not be cancelled')
        .setData(result);
      return res.status(400).json(apiResponse.build());
    }
  }

  @Post('accept-invitation')
  async acceptInvitation(
    @Body() body: { user: string; password: string, verificationCode: string },
    @Res() res: Response
  ): Promise<Response<ApiResponse<DashboardUserDataDto | null>>> {
    const apiResponse = new ApiResponseBuilder<DashboardUserDataDto | null>();
    const result = await this.organizationsService.createUserFromInvitation(
      body.user,
      body.password,
      body.verificationCode
    );
    if (result) {
      apiResponse
        .setStatusCode(200)
        .setMessage('Invitation accepted successfully')
        .setData(result);
      return res.status(200).json(apiResponse.build());
    } else {
      apiResponse
        .setStatusCode(400)
        .setMessage('Invitation could not be accepted')
        .setData(result);
      return res.status(400).json(apiResponse.build());
    }
  }
}