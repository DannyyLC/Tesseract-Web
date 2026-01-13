import { JwtAuthGuard } from '../../../../auth/guards/jwt-auth.guard';
import { CreateOrganizationDto, UpdateOrganizationDto } from '../../../dto';
import { OrganizationDashboardDto } from '../../../dto/organization-dashboard.dto';
import { OrganizationsService } from '../../../organizations.service';
import { Body, Controller, Get, Param, Patch, Post, Res, UseGuards } from '@nestjs/common';
import { ApiResponseBuilder } from '@workflow-automation/shared-types';
import { Response } from 'express';
import { DeactivateOrganizationDto } from '../../../dto/deactivate-organization.dto';

@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get('dashboard/:id')
  async getDashboardData(@Res() res: Response, @Param('id') id: string) {
    const apiResponse = new ApiResponseBuilder<OrganizationDashboardDto>();
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
  async createOrganization(@Body() body: CreateOrganizationDto, @Res() res: Response) {
    const result = await this.organizationsService.create(body);
    const apiResponse = new ApiResponseBuilder();
    if (!result) {
      apiResponse.setStatusCode(400).setMessage('Organization could not be created');
      return res.status(500).json(apiResponse.build());
    } else {
      apiResponse
        .setStatusCode(201)
        .setMessage('Organization created successfully')
        .setData(result);
      return res.status(201).json(apiResponse.build());
    }
  }

  @Patch('update')
  async updateOrganization(@Body() body: UpdateOrganizationDto) {
    const result = await this.organizationsService.update(body);
    const apiResponse = new ApiResponseBuilder();
    if (!result) {
      apiResponse.setStatusCode(400).setMessage('Organization could not be updated');
      return apiResponse.build();
    } else {
      apiResponse
        .setStatusCode(200)
        .setMessage('Organization updated successfully')
        .setData(result);
      return apiResponse.build();
    }
  }

  @Post('deactivate/:id')
  deactivateOrganization(
    @Body() body: DeactivateOrganizationDto,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const result = this.organizationsService.deactivate(id, body.deactivatedBy, body.reason);
    const apiResponse = new ApiResponseBuilder();
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
  activateOrganization(@Param('id') id: string, @Res() res: Response) {
    const result = this.organizationsService.reactivate(id);
    const apiResponse = new ApiResponseBuilder();
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
