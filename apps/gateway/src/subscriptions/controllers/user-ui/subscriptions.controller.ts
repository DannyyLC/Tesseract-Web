import { JwtAuthGuard } from '@workflow-platform/gateway/src/auth/guards/jwt-auth.guard';
import { DashboardSubscriptionDto } from '../../../subscriptions/dto/dashboard-subscription.dto';
import { SubscriptionsService } from '../../../subscriptions/subscriptions.service';
import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { ApiResponseBuilder } from '@workflow-automation/shared-types';
import { Request, Response } from 'express';

@Controller('subscriptions')
// @UseGuards(JwtAuthGuard)
export class SubscriptionsController {
    constructor(
        private readonly subscriptionsService: SubscriptionsService,
    ) {}

    @Get('dashboard/:organizationId')
    async getDashboardData(
        @Param('organizationId') organizationId: string,
        @Res() res: Response,
    ): Promise<Response<ApiResponseBuilder<DashboardSubscriptionDto>>> {
        const apiResponse = new ApiResponseBuilder<DashboardSubscriptionDto>();
        const result = await this.subscriptionsService.getDashboardData(organizationId);
        if (!result) {
            apiResponse
                .setStatusCode(404)
                .setMessage('No subscription data found for the organization');
            return res.status(404).json(apiResponse.build());
        } else {
            apiResponse
                .setStatusCode(200)
                .setMessage('Subscription dashboard data retrieved successfully')
                .setData(result);
            return res.status(200).json(apiResponse.build());
        }
    }
}