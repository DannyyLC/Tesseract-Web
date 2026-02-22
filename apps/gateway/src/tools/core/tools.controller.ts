import { Controller, Delete, Get, Param, Post, Res, UseGuards, Body } from '@nestjs/common';
import { ApiResponseBuilder } from '@workflow-automation/shared-types';
import { HttpStatusCode } from 'axios';
import { Response } from 'express';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { UserPayload } from '../../common/types/user-payload.type';
import { ToolsService } from './tools.service';
import { UpsertCredentialsDto } from './dto/upsert-credentials.dto';

@Controller('tools')
@UseGuards(JwtAuthGuard)
export class ToolsController {
  constructor(private readonly toolsService: ToolsService) {}

  @Post(':toolId/credentials')
  async upsertCredentials(
    @Param('toolId') toolId: string,
    @CurrentUser() user: UserPayload,
    @Body() body: UpsertCredentialsDto,
    @Res() res: Response,
  ) {
    const apiResponse = new ApiResponseBuilder<boolean>();
    try {
      await this.toolsService.upsertCredentials(toolId, user.organizationId, user.sub, body);
      apiResponse.setSuccess(true).setData(true).setMessage('Credentials securely stored');
      return res.status(HttpStatusCode.Ok).json(apiResponse.build());
    } catch (error: any) {
      apiResponse
        .setSuccess(false)
        .setMessage(error?.message || 'Error saving credentials');
      return res.status(HttpStatusCode.BadRequest).json(apiResponse.build());
    }
  }

  @Delete(':toolId')
  async disconnectTool(
    @Param('toolId') toolId: string,
    @CurrentUser() user: UserPayload,
    @Res() res: Response,
  ) {
    const apiResponse = new ApiResponseBuilder<boolean>();
    try {
      await this.toolsService.disconnectTool(toolId, user.organizationId, user.sub);
      apiResponse.setSuccess(true).setData(true).setMessage('Tool disconnected and secrets wiped');
      return res.status(HttpStatusCode.Ok).json(apiResponse.build());
    } catch (error: any) {
      apiResponse
        .setSuccess(false)
        .setMessage(error?.message || 'Error disconnecting tool');
      return res.status(HttpStatusCode.BadRequest).json(apiResponse.build());
    }
  }
}
