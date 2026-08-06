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
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { MediaProcessingService } from '@/automation/media-processing/media-processing.service';
import { DEFAULT_MEDIA_POLICY, MediaPolicy } from '@/automation/media-processing/media-policy';

/**
 * Política que rige el dictado del panel: audio siempre encendido.
 *
 * Es deliberadamente distinta de la del workflow. La del workflow decide qué sabe
 * escuchar el agente en WhatsApp; esta solo aporta el tope de duración y los textos de
 * error, reutilizando los mismos defaults para no inventar mensajes nuevos.
 */
const WEB_DICTATION_POLICY: MediaPolicy = {
  ...DEFAULT_MEDIA_POLICY,
  audio: { ...DEFAULT_MEDIA_POLICY.audio, enabled: true },
};
import { ApiResponse, ApiResponseBuilder, PaginatedResponse, UserRole } from '@tesseract/types';
import { JwtAuthGuard } from '@/identity/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/identity/auth/decorators/current-user.decorator';
import { UserPayload } from '@/platform/common/types/jwt-payload.type';
import { RolesGuard } from '@/identity/auth/guards/roles.guard';
import { Roles } from '@/identity/auth/decorators/roles.decorator';

@Controller('conversations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ConversationsController {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly mediaProcessingService: MediaProcessingService,
  ) {}

  /**
   * POST /conversations/transcribe
   *
   * Transcribe un dictado grabado en el navegador y devuelve solo el texto. El audio
   * llega como cuerpo binario (`Content-Type: audio/...`), se transcribe al vuelo y se
   * descarta: nunca se almacena ni se convierte en adjunto de un mensaje.
   *
   * No cuelga de una conversación a propósito: el dictado tiene que funcionar también
   * en `/conversations/new`, donde todavía no existe ninguna.
   *
   * Tampoco mira la política del workflow. Esa política gobierna lo que el agente sabe
   * *recibir* por WhatsApp; aquí el audio no llega al workflow —lo que se envía es
   * texto—, así que dictar desde el panel es una comodidad del operador y está siempre
   * disponible. El tope de tamaño sigue vigente como red de seguridad.
   */
  @Post('transcribe')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  // Cada transcripción cuesta dinero: se limita por si el micrófono se queda pulsado.
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async transcribe(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<{ text: string }>>> {
    const apiResponse = new ApiResponseBuilder<{ text: string }>();

    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const mimeType = req.headers['content-type'] ?? 'audio/webm';

    const result = await this.mediaProcessingService.transcribeDictation({
      buffer,
      mimeType,
      policy: WEB_DICTATION_POLICY,
    });

    if (result.status === 'PROCESSED') {
      return res
        .status(200)
        .json(
          apiResponse
            .setData({ text: result.text })
            .setMessage('Audio transcribed successfully')
            .setSuccess(true)
            .build(),
        );
    }

    // El mensaje viene de la política del workflow, así que el cliente puede
    // personalizarlo igual que hace con las notas de voz de WhatsApp.
    const status = result.status === 'REJECTED' ? 400 : 502;
    return res
      .status(status)
      .json(apiResponse.setMessage(result.message).setSuccess(false).build());
  }

  @Get('dashboard')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  async getDashboardData(
    @CurrentUser() user: UserPayload,
    @Query('cursor') cursor: string | null = null,
    @Query('pageSize', new DefaultValuePipe(10), ParseIntPipe) pageSize: number,
    @Query('action') action: 'next' | 'prev' | null = null,
    @Query('status') status: string | undefined,
    @Query('isIntervened') isIntervened: string | undefined,
    @Query('needsFollowUp') needsFollowUp: string | undefined,
    @Query('workflowId') workflowId: string | undefined,
    @Query('userId') userId: string | undefined,
    @Query('prioritizeHitl', new DefaultValuePipe('true')) prioritizeHitl: string,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<PaginatedResponse<DashboardConversationDto>>>> {
    const apiResponse = new ApiResponseBuilder<PaginatedResponse<DashboardConversationDto>>();

    const paginatedResponse = await this.conversationsService.findAll({
      organizationId: user.organizationId,
      cursor: cursor,
      take: pageSize,
      paginationAction: action,
      status,
      isHumanInTheLoop:
        isIntervened === 'true' ? true : isIntervened === 'false' ? false : undefined,
      needsFollowUp:
        needsFollowUp === 'true' ? true : needsFollowUp === 'false' ? false : undefined,
      workflowId,
      userId,
      prioritizeHitl: prioritizeHitl !== 'false',
    });

    const items: DashboardConversationDto[] = paginatedResponse.items.map((c: any) => ({
      id: c.id,
      title: c.title,
      channel: c.channel,
      status: c.status,
      isHumanInTheLoop: c.isHumanInTheLoop,
      needsFollowUp: c.needsFollowUp,
      followUpReason: c.followUpReason,
      endUserPhoneNumber: c.endUserPhoneNumber ?? null,
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
      needsFollowUp: conversation.needsFollowUp,
      followUpReason: conversation.followUpReason,
      endUserPhoneNumber: conversation.endUserPhoneNumber ?? null,
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
