import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import {
  CreateOrganizationDto,
  UpdateOrganizationDto,
  DeactivateOrganizationDto,
  DashboardOrganizationDto,
} from '../../dto';
import { OrganizationsService } from '../../organizations.service';
import { Body, Controller, Get, Param, Patch, Post, Res, UseGuards } from '@nestjs/common';
import { ApiResponseBuilder } from '@workflow-automation/shared-types';
import { Response } from 'express';
import { Organization } from '@workflow-platform/database';

@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

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

  @Post('create')
  async createOrganization(
    @Body() body: CreateOrganizationDto,
    @Res() res: Response,
  ): Promise<Response<ApiResponseBuilder<Organization>>> {
    const result = await this.organizationsService.create(body);
    const apiResponse = new ApiResponseBuilder<Organization>();
    if (!result) {
      apiResponse.setStatusCode(400).setMessage('Organization could not be created');
      return res.status(400).json(apiResponse.build());
    } else {
      apiResponse
        .setStatusCode(201)
        .setMessage('Organization created successfully')
        .setData(result);
      return res.status(201).json(apiResponse.build());
    }
  }

  @Patch('update')
  async updateOrganization(
    @Body() body: UpdateOrganizationDto,
    @Res() res: Response,
  ): Promise<Response<ApiResponseBuilder<Organization>>> {
    const result = await this.organizationsService.update(body);
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

  @Post('deactivate/:id')
  async deactivateOrganization(
    @Body() body: DeactivateOrganizationDto,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<Response<ApiResponseBuilder<Organization>>> {
    const result = await this.organizationsService.deactivate(id, body.deactivatedBy, body.reason);
    const apiResponse = new ApiResponseBuilder<Organization>();
    if (!result) {
      apiResponse.setStatusCode(500).setMessage('Organization could not be deactivated');
      return res.status(500).json(apiResponse.build());
    } else {
      apiResponse
        .setStatusCode(200)
        .setMessage('Organization deactivated successfully')
        .setData(result);
      return res.status(200).json(apiResponse.build());
    }
  }

  @Patch('activate/:id')
  async activateOrganization(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<Response<ApiResponseBuilder<Organization>>> {
    const result = await this.organizationsService.reactivate(id);
    const apiResponse = new ApiResponseBuilder<Organization>();
    if (!result) {
      apiResponse.setStatusCode(500).setMessage('Organization could not be activated');
      return res.status(500).json(apiResponse.build());
    } else {
      apiResponse
        .setStatusCode(200)
        .setMessage('Organization activated successfully')
        .setData(result);
      return res.status(200).json(apiResponse.build());
    }
  }
}
