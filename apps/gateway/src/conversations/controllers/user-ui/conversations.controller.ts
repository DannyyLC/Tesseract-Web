import { UpdateConversationDto, ConversationDetailDto } from '../../dto';
import {
  DashboardConversationDto,
  ConversationsStatsDto as ConversationStatsDto,
} from '@tesseract/types';
import { ConversationsService } from '../../conversations.service';
import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Query,
  Res,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiResponse, ApiResponseBuilder, PaginatedResponse, UserRole } from '@tesseract/types';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { UserPayload } from '../../../common/types/jwt-payload.type';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import { Roles } from '../../../auth/decorators/roles.decorator';

@Controller('conversations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get('dashboard')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  async getDashboardData(
    @CurrentUser() user: UserPayload,
    @Query('cursor') cursor: string | null = null,
    @Query('pageSize', new DefaultValuePipe(10), ParseIntPipe) pageSize: number,
    @Query('action') action: 'next' | 'prev' | null = null,
    @Query('workflowId') workflowId: string | undefined,
    @Query('userId') userId: string | undefined,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<PaginatedResponse<DashboardConversationDto>>>> {
    const apiResponse = new ApiResponseBuilder<PaginatedResponse<DashboardConversationDto>>();

    const paginatedResponse = await this.conversationsService.findAll({
      organizationId: user.organizationId,
      cursor: cursor,
      take: pageSize,
      paginationAction: action,
      workflowId,
      userId,
    });

    const items: DashboardConversationDto[] = paginatedResponse.items.map((c) => ({
      id: c.id,
      title: c.title,
      channel: c.channel,
      status: c.status,
      isHumanInTheLoop: c.isHumanInTheLoop,
      messageCount: c.messageCount,
      lastMessageAt: c.lastMessageAt,
      closedAt: c.closedAt,
      workflowId: c.workflowId,
      userId: c.userId,
      isInternal: !!c.userId,
      organizationId: c.organizationId,
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

  @Get('stats')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  async getStats(
    @CurrentUser() user: UserPayload,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<ConversationStatsDto>>> {
    const apiResponse = new ApiResponseBuilder<ConversationStatsDto>();
    const stats = await this.conversationsService.getStats(user.organizationId);
    apiResponse
      .setData(stats)
      .setMessage('Conversation stats retrieved successfully')
      .setSuccess(true);
    return res.status(200).json(apiResponse.build());
  }

  @Get(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  async getById(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<ConversationDetailDto>>> {
    const apiResponse = new ApiResponseBuilder<ConversationDetailDto>();

    const conversation = await this.conversationsService.findOne(user.organizationId, id);
    if (!conversation) {
      throw new NotFoundException(`Conversation with ID ${id} not found`);
    }

    const detailDto: ConversationDetailDto = {
      id: conversation.id,
      title: conversation.title,
      channel: conversation.channel,
      status: conversation.status,
      isHumanInTheLoop: conversation.isHumanInTheLoop,
      messageCount: conversation.messageCount,
      lastMessageAt: conversation.lastMessageAt,
      createdAt: conversation.createdAt,
      closedAt: conversation.closedAt,
      workflowId: conversation.workflowId,
      userId: conversation.userId,
      endUserId: conversation.endUserId,
      messages: conversation.messages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt,
        attachments: msg.attachments,
      })),
    };

    apiResponse
      .setData(detailDto)
      .setMessage('Conversation retrieved successfully')
      .setSuccess(true);

    return res.status(200).json(apiResponse.build());
  }

  @Patch(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
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
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async remove(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<any>>> {
    const apiResponse = new ApiResponseBuilder<any>();

    await this.conversationsService.remove(user.organizationId, id);

    apiResponse.setMessage('Conversation deleted successfully').setSuccess(true);

    return res.status(200).json(apiResponse.build());
  }
}
