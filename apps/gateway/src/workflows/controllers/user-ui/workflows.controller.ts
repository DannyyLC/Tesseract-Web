import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  DefaultValuePipe,
  Header,
  StreamableFile,
  Res,
} from '@nestjs/common';
import { WorkflowsService } from '../../workflows.service';
import { UpdateWorkflowDto, ExecuteWorkflowDto } from '../../dto';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { UserPayload } from '../../../common/types/jwt-payload.type';
import {
  ApiResponseBuilder,
  CursorPaginatedResponse,
  WorkflowCategory,
} from '@workflow-automation/shared-types';
import { Response } from 'express';
import { DashboardWorkflowDto } from '@/workflows/dto/dashboard-workflow.dto';
import { WorkflowStatsDto } from '@/workflows/dto/workflow-stats.dto';

/**
 * Controller de Workflows
 * Maneja todas las peticiones HTTP relacionadas con workflows
 */
@Controller('workflows')
@UseGuards(JwtAuthGuard)
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) { }

  /**
   * GET /workflows/dashboard
   * Obtener datos para el dashboard de workflows (paginado)
   */
  @Get('dashboard')
  async getDashboardData(
    @CurrentUser() user: UserPayload,
    @Res() res: Response,
    @Query('cursor') cursor: string | null = null,
    @Query('pageSize') pageSize: number = 10,
    @Query('action') action: 'next' | 'prev' | null = null,
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
    @Query('category') category?: WorkflowCategory,
  ): Promise<Response<ApiResponseBuilder<CursorPaginatedResponse<DashboardWorkflowDto>>>> {
    const apiResponse = new ApiResponseBuilder<CursorPaginatedResponse<DashboardWorkflowDto>>();

    // Parse boolean filter (query params come as strings)
    const isActiveBool = isActive === 'true' ? true : isActive === 'false' ? false : undefined;

    const result = await this.workflowsService.getDashboardData(
      user.organizationId,
      cursor,
      pageSize,
      action,
      {
        search,
        isActive: isActiveBool,
        category,
      },
    );

    if (result.items.length === 0) {
      apiResponse
        .setStatusCode(HttpStatus.OK)
        .setMessage('No workflows found with current filters')
        .setData(result);
      return res.status(HttpStatus.OK).json(apiResponse.build());
    }

    apiResponse
      .setData(result)
      .setMessage('Dashboard workflows data retrieved successfully')
      .setSuccess(true);
    return res.status(HttpStatus.OK).json(apiResponse.build());
  }

  /**
   * GET /workflows/stats
   * Obtener estadísticas globales de la organización
   */
  @Get('stats')
  async getStats(
    @CurrentUser() user: UserPayload,
    @Res() res: Response,
  ): Promise<Response<ApiResponseBuilder<WorkflowStatsDto>>> {
    const apiResponse = new ApiResponseBuilder<WorkflowStatsDto>();
    const stats = await this.workflowsService.getStats(user.organizationId);
    apiResponse.setData(stats).setMessage('Workflow stats retrieved successfully').setSuccess(true);
    return res.status(HttpStatus.OK).json(apiResponse.build());
  }

  /**
   * GET /workflows/:id
   * Obtener un workflow específico
   */
  @Get(':id')
  async getById(@CurrentUser() user: UserPayload, @Param('id') id: string) {
    return this.workflowsService.findOne(user.organizationId, id);
  }

  /**
   * PUT /workflows/:id
   * Actualizar un workflow
   */
  @Put(':id')
  async update(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() updateDto: UpdateWorkflowDto,
  ) {
    return this.workflowsService.update(user.organizationId, id, updateDto);
  }

  /**
   * DELETE /workflows/:id
   * Eliminar un workflow (soft delete)
   */
  @Delete(':id')
  async remove(@CurrentUser() user: UserPayload, @Param('id') id: string) {
    return this.workflowsService.remove(user.organizationId, id);
  }

  /**
   * POST /workflows/:id/execute
   * Ejecutar un workflow
   */
  @Post(':id/execute')
  @HttpCode(HttpStatus.CREATED)
  async execute(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() executeDto: ExecuteWorkflowDto,
  ) {
    const execution = await this.workflowsService.execute(
      user.organizationId,
      id,
      executeDto.input,
      { ...executeDto.metadata, channel: 'dashboard' },
      user.sub,
      undefined, // apiKeyId
      'manual', // trigger: UI executions are manual
    );

    // Transformar respuesta para ocultar metadata interna (DTO simplificado)
    const result = execution.result as any;
    const messages = result?.messages ?? [];
    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
    const assistantContent = lastMessage?.role === 'assistant' ? lastMessage.content : null;

    return {
      conversationId: result?.conversationId,
      content: assistantContent,
      metadata: {
        execution_time_ms: result?.metadata?.execution_time_ms,
      },
    };
  }

  /**
   * POST /workflows/:id/execute/stream
   * Ejecutar un workflow en modo streaming
   * Retorna: Content-Type: text/event-stream
   */
  @Post(':id/execute/stream')
  @Header('Content-Type', 'text/event-stream')
  @Header('Cache-Control', 'no-cache')
  @Header('Connection', 'keep-alive')
  async executeStream(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() executeDto: ExecuteWorkflowDto,
  ): Promise<StreamableFile> {
    const stream = await this.workflowsService.executeStream(
      user.organizationId,
      id,
      executeDto.input,
      { ...executeDto.metadata, channel: 'dashboard' },
      user.sub,
      undefined, // apiKeyId
      'manual', // trigger: UI executions are manual
    );

    return new StreamableFile(stream as any);
  }

  /**
   * GET /workflows/:id/metrics
   * Obtiene métricas detalladas de un workflow (Charts, KPIs)
   */
  @Get(':id/metrics')
  async getMetrics(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Query('period', new DefaultValuePipe('30d')) period?: string,
  ) {
    return this.workflowsService.getMetrics(user.organizationId, id, period);
  }
}
