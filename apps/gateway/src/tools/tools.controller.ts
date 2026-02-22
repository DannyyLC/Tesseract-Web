import { Body, Controller, Delete, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ApiResponseBuilder } from '@workflow-automation/shared-types';
import { HttpStatusCode } from 'axios';
import { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserPayload } from '../common/types/user-payload.type';
import { ToolsService } from './tools.service';
import { UpsertCredentialsDto } from './dto/upsert-credentials.dto';
import { CreateTenantToolDto } from './dto/create-tenant-tool.dto';

@Controller('tools')
@UseGuards(JwtAuthGuard)
export class ToolsController {
  constructor(private readonly toolsService: ToolsService) {}

  @Get('catalog')
  async getToolCatalog(
    @Res() res: Response,
  ) {
    const apiResponse = new ApiResponseBuilder<any[]>();
    try {
      const catalog = await this.toolsService.getToolCatalog();
      apiResponse.setSuccess(true).setData(catalog);
      return res.status(HttpStatusCode.Ok).json(apiResponse.build());
    } catch (error: any) {
      apiResponse
        .setSuccess(false)
        .setMessage(error?.message || 'Error fetching tool catalog');
      return res.status(HttpStatusCode.BadRequest).json(apiResponse.build());
    }
  }

  @Get()
  async getTenantTools(
    @CurrentUser() user: UserPayload,
    @Res() res: Response,
  ) {
    const apiResponse = new ApiResponseBuilder<any[]>();
    try {
      const tools = await this.toolsService.getTenantTools(user.organizationId);
      apiResponse.setSuccess(true).setData(tools);
      return res.status(HttpStatusCode.Ok).json(apiResponse.build());
    } catch (error: any) {
      apiResponse
        .setSuccess(false)
        .setMessage(error?.message || 'Error fetching tools');
      return res.status(HttpStatusCode.BadRequest).json(apiResponse.build());
    }
  }

  @Post()
  async createTenantTool(
    @CurrentUser() user: UserPayload,
    @Body() body: CreateTenantToolDto,
    @Res() res: Response,
  ) {
    const apiResponse = new ApiResponseBuilder<any>();
    try {
      const tool = await this.toolsService.createTenantTool(user.organizationId, user.sub, body);
      apiResponse.setSuccess(true).setData(tool).setMessage('Tool instance created');
      return res.status(HttpStatusCode.Created).json(apiResponse.build());
    } catch (error: any) {
      apiResponse
        .setSuccess(false)
        .setMessage(error?.message || 'Error creating tool instance');
      return res.status(HttpStatusCode.BadRequest).json(apiResponse.build());
    }
  }

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
