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
import { ApiResponseBuilder, PaginatedResponse, UserRole } from '@tesseract/types';
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
import { RolesGuard } from '../../../../auth/guards/roles.guard';
import { Roles } from '../../../../auth/decorators/roles.decorator';

@Controller('tenant-tool')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TenantToolController {
  constructor(private readonly tenantToolService: TenantToolService) {}

  @Get('dashboard')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  async getDashboardData(
    @CurrentUser() user: UserPayload,
    @Query('cursor') cursor: string | null = null,
    @Query('pageSize', new DefaultValuePipe(10), ParseIntPipe) pageSize: number,
    @Query('action') action: 'next' | 'prev' | null = null,
    @Res() res: Response,
  ): Promise<Response<PaginatedResponse<DashboardTenantToolDto>>> {
    const apiResponse = new ApiResponseBuilder<PaginatedResponse<DashboardTenantToolDto>>();
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
  @Roles(UserRole.OWNER, UserRole.ADMIN)
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
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async updateTenantTool(
    @Param('id') id: string,
    @Body() body: UpdateTenantToolDto,
    @CurrentUser() user: UserPayload,
    @Res() res: Response,
  ) {
    const apiResponse = new ApiResponseBuilder<UpdateTenantToolDto | null>();
    const updated = await this.tenantToolService.updateTenantTool(id, user.organizationId, user.sub, user.role, body);
    if (!updated) {
      apiResponse.setSuccess(false).setMessage('Error updating tenant tool');
      return res.status(HttpStatusCode.BadRequest).json(apiResponse.build());
    }
    apiResponse.setSuccess(true).setData(updated).setMessage('Tenant tool updated successfully');
    return res.status(HttpStatusCode.Ok).json(apiResponse.build());
  }

  @Post('add-workflows/:id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async addWorkflowsToTenantTool(
    @Param('id') id: string,
    @Body() body: WorkflowIdsDto,
    @CurrentUser() user: UserPayload,
    @Res() res: Response,
  ) {
    const apiResponse = new ApiResponseBuilder<UpdateTenantToolDto | null>();
    const updated = await this.tenantToolService.addWorkflowToTenantTool(id, user.organizationId, user.sub, user.role, body.workflowIds);
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
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async removeWorkflowsFromTenantTool(
    @Param('id') id: string,
    @Body() body: WorkflowIdsDto,
    @CurrentUser() user: UserPayload,
    @Res() res: Response,
  ) {
    const apiResponse = new ApiResponseBuilder<UpdateTenantToolDto | null>();
    const updated = await this.tenantToolService.removeWorkflowFromTenantTool(id, user.organizationId, user.sub, user.role, body.workflowIds);
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
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
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
  @Roles(UserRole.OWNER, UserRole.ADMIN)
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
      apiResponse.setSuccess(false).setMessage(error?.message ?? 'Error disconnecting tool');
      return res.status(HttpStatusCode.BadRequest).json(apiResponse.build());
    }
  }

  @Delete(':toolId')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
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
      apiResponse.setSuccess(false).setMessage(error?.message ?? 'Error deleting tool');
      return res.status(HttpStatusCode.BadRequest).json(apiResponse.build());
    }
  }
}
