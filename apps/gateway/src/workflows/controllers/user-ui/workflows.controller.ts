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
import { ExecutionsService } from '../../../executions/executions.service';
import { UpdateWorkflowDto, ExecuteWorkflowDto } from '../../dto';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { UserPayload } from '../../../common/types/jwt-payload.type';
import { ApiResponseBuilder } from '@workflow-automation/shared-types';
import { Response } from 'express';
import { DashboardWorkflowDto } from '@/workflows/dto/dashboard-workflow.dto';

/**
 * Controller de Workflows
 * Maneja todas las peticiones HTTP relacionadas con workflows
 */
@Controller('workflows')
@UseGuards(JwtAuthGuard)
export class WorkflowsController {
  constructor(
    private readonly workflowsService: WorkflowsService,
    private readonly executionsService: ExecutionsService,
  ) { }

  /**
   * GET /workflows
   * Listar todos los workflows de la organización
   */
  @Get()
  findAll(@CurrentUser() user: UserPayload, @Query('includeDeleted') includeDeleted?: string) {
    const includeDeletedBool = includeDeleted === 'true';
    return this.workflowsService.findAll(user.organizationId, includeDeletedBool);
  }

  /**
   * GET /workflows/:id
   * Obtener un workflow específico
   */
  @Get(':id')
  findOne(@CurrentUser() user: UserPayload, @Param('id') id: string) {
    return this.workflowsService.findOne(user.organizationId, id);
  }

  /**
   * PUT /workflows/:id
   * Actualizar un workflow
   */
  @Put(':id')
  update(
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
  remove(@CurrentUser() user: UserPayload, @Param('id') id: string) {
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
      executeDto.metadata,
      user.sub,
      undefined, // apiKeyId
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
      executeDto.metadata,
      user.sub,
      undefined, // apiKeyId
    );

    return new StreamableFile(stream as any);
  }

  /**
   * GET /workflows/:id/analytics
   * Obtiene analytics de un workflow agrupadas por fuente (API key o usuario)
   *
   * Query params opcionales:
   *   ?period=30d  - Periodo de tiempo (24h|7d|30d|90d|all) default: 30d
   */
  @Get(':id/analytics')
  async getAnalytics(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Query('period', new DefaultValuePipe('30d')) period?: string,
  ) {
    return this.executionsService.getAnalyticsBySource(id, user.organizationId, period);
  }

  @Get('dashboard/:idOrganization')
  async getDashboardWorkflows(
    @Param('idOrganization') idOrganization: string,
    @Res() res: Response,
  ): Promise<Response<ApiResponseBuilder<DashboardWorkflowDto[]>>> {
    const apiResponse = new ApiResponseBuilder<DashboardWorkflowDto[]>()
    const result = await this.workflowsService.getDashboardData(idOrganization);
    apiResponse
      .setData(result)
      .setMessage('Dashboard workflows data retrieved successfully')
      .setSuccess(true);
    return res.status(HttpStatus.OK).json(apiResponse.build());
  }
}
