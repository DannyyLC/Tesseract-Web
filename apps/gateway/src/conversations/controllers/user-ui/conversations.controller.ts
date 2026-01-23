import { DashboardConversationDto, UpdateConversationDto } from '../../dto';
import { ConversationsService } from '../../conversations.service';
import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import {
  ApiResponse,
  ApiResponseBuilder,
  CursorPaginatedResponse
} from '@workflow-automation/shared-types';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { UserPayload } from '../../../common/types/jwt-payload.type';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) { }

  @Get('dashboard')
  async getDashboardData(
    @CurrentUser() user: UserPayload,
    @Query('cursor') cursor: string | null = null,
    @Query('pageSize') pageSize: number = 10,
    @Query('action') action: 'next' | 'prev' | null = null,
    @Query('workflowId') workflowId: string | undefined,
    @Query('userId') userId: string | undefined,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<CursorPaginatedResponse<DashboardConversationDto>>>> {
    const apiResponse = new ApiResponseBuilder<CursorPaginatedResponse<DashboardConversationDto>>();

    const paginatedResponse = await this.conversationsService.findAll({
      organizationId: user.organizationId,
      cursor: cursor,
      take: pageSize,
      paginationAction: action,
      workflowId,
      userId,
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
      isInternal: !!c.userId, // Si tiene userId es interno
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
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<any>>> {
    const apiResponse = new ApiResponseBuilder<any>();

    const conversation = await this.conversationsService.findOne(user.organizationId, id);
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
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<any>>> {
    const apiResponse = new ApiResponseBuilder<any>();

    const conversation = await this.conversationsService.update(user.organizationId, id, dto);

    apiResponse
      .setData(conversation)
      .setMessage('Conversation updated successfully')
      .setSuccess(true);

    return res.status(200).json(apiResponse.build());
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<any>>> {
    const apiResponse = new ApiResponseBuilder<any>();

    await this.conversationsService.remove(user.organizationId, id);

    apiResponse
      .setMessage('Conversation deleted successfully')
      .setSuccess(true);

    return res.status(200).json(apiResponse.build());
  }
}
