import { DashboardConversationDto } from '@/conversations/dto/dashboard-conversation.dto';
import { ConversationsService } from '../../conversations.service';
import { Controller, Get, Param, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiResponse, ApiResponseBuilder, PaginatedResponse } from '@workflow-automation/shared-types';

@Controller('conversations')
export class ConversationsController {

    constructor(
        private readonly conversationsService: ConversationsService
    ) {}

    @Get('dashboard/:idOrganization')
    async getDashboardData(
        @Param('idOrganization') idOrganization: string,
        @Param('initPage') initPage: number = 1,
        @Param('pageSize') pageSize: number = 10,
        @Res() res: Response,
    ): Promise<Response<ApiResponse<PaginatedResponse<DashboardConversationDto>>>> {
        const apiResponse = new ApiResponseBuilder<PaginatedResponse<DashboardConversationDto>>()
        const result = await this.conversationsService.getDashboardData(idOrganization, initPage, pageSize);
        const PaginatedResponse: PaginatedResponse<DashboardConversationDto> = {
            items: result.conversations,
            totalItems: result.conversations.length,
            totalPages: result.totalPages,
            currentPage: initPage,
            pageSize: pageSize
        };
        apiResponse
            .setData(PaginatedResponse)
            .setMessage('Dashboard conversations data retrieved successfully')
            .setSuccess(true);
        return res.status(200).json(apiResponse.build());
    }

}
