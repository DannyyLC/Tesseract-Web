import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiResponseBuilder, CursorPaginatedResponse } from '@tesseract/types';
import { HttpStatusCode } from 'axios';
import { Response } from 'express';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../../auth/guards/jwt-auth.guard';
import { UserPayload } from '../../../../common/types/jwt-payload.type';
import { DashboardTenantToolDto } from '@tesseract/types';
import { WorkflowIdsDto } from '../../dto/workflow-ids.dto';
import { TenantToolService } from '../../tenant-tool.service';
import { CreateTenantToolDto } from '../../dto/create-tenant-tool.dto';
import { UpdateTenantToolDto } from '../../dto/update-tenant-tool.dto';

@Controller('tenant-tool')
@UseGuards(JwtAuthGuard)
export class TenantToolController {
  constructor(private readonly tenantToolService: TenantToolService) {}

  @Get('dashboard')
  async getDashboardData(
    @CurrentUser() user: UserPayload,
    @Query('cursor') cursor: string | null = null,
    @Query('pageSize', new DefaultValuePipe(10), ParseIntPipe) pageSize: number,
    @Query('action') action: 'next' | 'prev' | null = null,
    @Res() res: Response,
  ): Promise<Response<CursorPaginatedResponse<DashboardTenantToolDto>>> {
    const apiResponse = new ApiResponseBuilder<CursorPaginatedResponse<DashboardTenantToolDto>>();
    const result = await this.tenantToolService.getDashboardData(
      user.organizationId,
      cursor,
      pageSize,
      action,
    );
    if (!result) {
      apiResponse
        .setMessage('No tenant tools found for dashboard')
        .setSuccess(false)
        .setStatusCode(HttpStatusCode.NotFound);
      return res.status(HttpStatusCode.NotFound).json(apiResponse.build());
    }

    apiResponse
      .setData(result)
      .setMessage('Dashboard tenant tool data retrieved successfully')
      .setSuccess(true);
    return res.status(200).json(apiResponse.build());
  }

  @Post('create')
  async createTenantTool(
    @CurrentUser() user: UserPayload,
    @Body() body: CreateTenantToolDto,
    @Res() res: Response,
  ) {
    const apiResponse = new ApiResponseBuilder<CreateTenantToolDto | null>();
    const created = await this.tenantToolService.createTenantTool(
      body,
      user.organizationId,
      user.sub,
    );
    if (!created) {
      apiResponse.setSuccess(false).setMessage('Error creating tenant tool');
      return res.status(HttpStatusCode.BadRequest).json(apiResponse.build());
    }
    apiResponse.setSuccess(true).setData(created).setMessage('Tenant tool created successfully');
    return res.status(HttpStatusCode.Created).json(apiResponse.build());
  }

  @Put('update/:id')
  async updateTenantTool(
    @Param('id') id: string,
    @Body() body: UpdateTenantToolDto,
    @Res() res: Response,
  ) {
    const apiResponse = new ApiResponseBuilder<UpdateTenantToolDto | null>();
    const updated = await this.tenantToolService.updateTenantTool(id, body);
    if (!updated) {
      apiResponse.setSuccess(false).setMessage('Error updating tenant tool');
      return res.status(HttpStatusCode.BadRequest).json(apiResponse.build());
    }
    apiResponse.setSuccess(true).setData(updated).setMessage('Tenant tool updated successfully');
    return res.status(HttpStatusCode.Ok).json(apiResponse.build());
  }

  @Post('add-workflows/:id')
  async addWorkflowsToTenantTool(
    @Param('id') id: string,
    @Body() body: WorkflowIdsDto,
    @Res() res: Response,
  ) {
    const apiResponse = new ApiResponseBuilder<UpdateTenantToolDto | null>();
    const updated = await this.tenantToolService.addWorkflowToTenantTool(id, body.workflowIds);
    if (!updated) {
      apiResponse.setSuccess(false).setMessage('Error adding workflows to tenant tool');
      return res.status(HttpStatusCode.BadRequest).json(apiResponse.build());
    }
    apiResponse
      .setSuccess(true)
      .setData(updated)
      .setMessage('Workflows added to tenant tool successfully');
    return res.status(HttpStatusCode.Ok).json(apiResponse.build());
  }

  @Post('remove-workflows/:id')
  async removeWorkflowsFromTenantTool(
    @Param('id') id: string,
    @Body() body: WorkflowIdsDto,
    @Res() res: Response,
  ) {
    const apiResponse = new ApiResponseBuilder<UpdateTenantToolDto | null>();
    const updated = await this.tenantToolService.removeWorkflowFromTenantTool(id, body.workflowIds);
    if (!updated) {
      apiResponse.setSuccess(false).setMessage('Error removing workflows from tenant tool');
      return res.status(HttpStatusCode.BadRequest).json(apiResponse.build());
    }
    apiResponse
      .setSuccess(true)
      .setData(updated)
      .setMessage('Workflows removed from tenant tool successfully');
    return res.status(HttpStatusCode.Ok).json(apiResponse.build());
  }

  @Get(':id')
  async getTenantToolById(@Param('id') id: string, @Res() res: Response) {
    const apiResponse = new ApiResponseBuilder<any>();
    const tenantTool = await this.tenantToolService.getTenantToolById(id);
    if (!tenantTool) {
      apiResponse.setSuccess(false).setMessage('Tenant tool not found');
      return res.status(HttpStatusCode.NotFound).json(apiResponse.build());
    }

    apiResponse
      .setSuccess(true)
      .setData(tenantTool)
      .setMessage('Tenant tool retrieved successfully');
    return res.status(HttpStatusCode.Ok).json(apiResponse.build());
  }

  @Delete('disconnect/:toolId')
  async disconnectTool(
    @Param('toolId') toolId: string,
    @CurrentUser() user: UserPayload,
    @Res() res: Response,
  ) {
    const apiResponse = new ApiResponseBuilder<boolean>();
    try {
      await this.tenantToolService.disconnectTool(toolId, user.organizationId, user.sub, user.role);
      apiResponse.setSuccess(true).setData(true).setMessage('Tool disconnected successfully');
      return res.status(HttpStatusCode.Ok).json(apiResponse.build());
    } catch (error: any) {
      apiResponse.setSuccess(false).setMessage(error?.message || 'Error disconnecting tool');
      return res.status(HttpStatusCode.BadRequest).json(apiResponse.build());
    }
  }

  @Delete(':toolId')
  async deleteTool(
    @Param('toolId') toolId: string,
    @CurrentUser() user: UserPayload,
    @Res() res: Response,
  ) {
    const apiResponse = new ApiResponseBuilder<boolean>();
    try {
      await this.tenantToolService.deleteTool(toolId, user.organizationId, user.sub, user.role);
      apiResponse.setSuccess(true).setData(true).setMessage('Tool soft-deleted and secrets wiped');
      return res.status(HttpStatusCode.Ok).json(apiResponse.build());
    } catch (error: any) {
      apiResponse.setSuccess(false).setMessage(error?.message || 'Error deleting tool');
      return res.status(HttpStatusCode.BadRequest).json(apiResponse.build());
    }
  }
}
