import { DashboardConversationDto, UpdateConversationDto } from '../../dto'
import { ConversationsService } from '../../conversations.service';
import { Body, Controller, Get, NotFoundException, Param, Patch, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiResponse, ApiResponseBuilder, PaginatedResponse } from '@workflow-automation/shared-types';

@Controller('conversations')
export class ConversationsController {

    constructor(
        private readonly conversationsService: ConversationsService
    ) { }

    @Get('dashboard/:idOrganization')
    async getDashboardData(
        @Param('idOrganization') idOrganization: string,
        @Param('initPage') initPage: number = 1,
        @Param('pageSize') pageSize: number = 10,
        @Res() res: Response,
    ): Promise<Response<ApiResponse<PaginatedResponse<DashboardConversationDto>>>> {
        const apiResponse = new ApiResponseBuilder<PaginatedResponse<DashboardConversationDto>>();

        // 1. Get total count
        const totalItems = await this.conversationsService.count({
            organizationId: idOrganization,
        });

        // 2. Get paginated data
        const rawConversations = await this.conversationsService.findAll({
            organizationId: idOrganization,
            skip: initPage > 0 ? (initPage - 1) * pageSize : 0,
            take: pageSize,
        });

        // 3. Map to DTO
        const items: DashboardConversationDto[] = rawConversations.map(c => ({
            title: c.title,
            channel: c.channel,
            status: c.status,
            messageCount: c.messageCount,
            lastMessageAt: c.lastMessageAt,
            createdAt: c.createdAt,
            closedAt: c.closedAt,
            workflowId: c.workflowId,
            userId: c.userId,
            endUserId: c.endUserId,
        }));

        const totalPages = Math.ceil(totalItems / pageSize);

        const paginatedResponse: PaginatedResponse<DashboardConversationDto> = {
            items,
            totalItems,
            totalPages,
            currentPage: initPage,
            pageSize: pageSize
        };

        apiResponse
            .setData(paginatedResponse)
            .setMessage('Dashboard conversations data retrieved successfully')
            .setSuccess(true);
        return res.status(200).json(apiResponse.build());
    }

    @Get(':id')
    async getById(
        @Param('id') id: string,
        @Res() res: Response,
    ): Promise<Response<ApiResponse<any>>> {
        const apiResponse = new ApiResponseBuilder<any>();

        const conversation = await this.conversationsService.findOne(id);
        if (!conversation) {
            throw new NotFoundException(`Conversation with ID ${id} not found`);
        }

        apiResponse
            .setData(conversation)
            .setMessage('Conversation retrieved successfully')
            .setSuccess(true);

        return res.status(200).json(apiResponse.build());
    }

    @Patch(':id')
    async update(
        @Param('id') id: string,
        @Body() dto: UpdateConversationDto,
        @Res() res: Response,
    ): Promise<Response<ApiResponse<any>>> {
        const apiResponse = new ApiResponseBuilder<any>();

        const conversation = await this.conversationsService.update(id, dto);

        apiResponse
            .setData(conversation)
            .setMessage('Conversation updated successfully')
            .setSuccess(true);

        return res.status(200).json(apiResponse.build());
    }

}
