import { DashboardConversationDto, UpdateConversationDto } from '../../dto';
import { ConversationsService } from '../../conversations.service';
import { Body, Controller, Get, NotFoundException, Param, Patch, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import {
  ApiResponse,
  ApiResponseBuilder,
  CursorPaginatedResponse
} from '@workflow-automation/shared-types';

@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get('dashboard/:idOrganization')
  async getDashboardData(
    @Param('idOrganization') idOrganization: string,
    @Query('cursor') cursor: string | null = null,
    @Query('pageSize') pageSize: number = 10,
    @Query('action') action: 'next' | 'prev' | null = null,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<CursorPaginatedResponse<DashboardConversationDto>>>> {
    const apiResponse = new ApiResponseBuilder<CursorPaginatedResponse<DashboardConversationDto>>();

    const paginatedResponse = await this.conversationsService.findAll({
      organizationId: idOrganization,
      cursor: cursor,
      take: pageSize,
      paginationAction: action,
    });

    const items: DashboardConversationDto[] = paginatedResponse.items.map((c) => ({
      title: c.title,
      channel: c.channel,
      status: c.status,
      isHumanInTheLoop: c.isHumanInTheLoop,
      messageCount: c.messageCount,
      lastMessageAt: c.lastMessageAt,
      createdAt: c.createdAt,
      closedAt: c.closedAt,
      workflowId: c.workflowId,
      userId: c.userId,
      endUserId: c.endUserId,
    }));

    apiResponse
      .setData({
        ...paginatedResponse,
        items: items,
      })
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
