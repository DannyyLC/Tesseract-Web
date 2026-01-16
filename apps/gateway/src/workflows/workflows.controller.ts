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
} from '@nestjs/common';
import { WorkflowsService } from './workflows.service';
import { ExecutionsService } from '../executions/executions.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { ExecuteWorkflowDto } from './dto/execute-workflow.dto';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentApiKey } from '../auth/decorators/current-api-key.decorator';
import { UserPayload } from '../common/types/jwt-payload.type';
import { ApiKeyPayload } from '../common/types/api-key-payload.type';
import { UserRole } from '@workflow-automation/shared-types';

/**
 * Controller de Workflows
 * Maneja todas las peticiones HTTP relacionadas con workflows
 *
 * ESTRATEGIA DE AUTENTICACIÓN:
 * - JWT (Token): Para gestión CRUD (crear, listar, editar, eliminar) - Solo UI
 * - API Key: Para ejecución de workflows - Apps externas
 *
 * Base path: /workflows
 */
@Controller('workflows')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkflowsController {
  constructor(
    private readonly workflowsService: WorkflowsService,
    private readonly executionsService: ExecutionsService,
  ) { }

  /**
   * POST /workflows
   * Crear un nuevo workflow
   * Solo Owner y Admin pueden crear workflows
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  create(@CurrentUser() user: UserPayload, @Body() createDto: CreateWorkflowDto) {
    return this.workflowsService.create(user.organizationId, createDto);
  }

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
   * Solo Owner y Admin pueden actualizar workflows
   */
  @Put(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
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
   * Solo Owner puede eliminar workflows
   */
  @Delete(':id')
  @Roles(UserRole.OWNER)
  remove(@CurrentUser() user: UserPayload, @Param('id') id: string) {
    return this.workflowsService.remove(user.organizationId, id);
  }

  /**
   * POST /workflows/:id/execute
   * Ejecutar un workflow usando API Key
   *
   * Headers requeridos:
   *   X-API-Key: ak_live_xxx...
   */
  @Post(':id/execute')
  @UseGuards(ApiKeyGuard)
  @HttpCode(HttpStatus.CREATED)
  async execute(
    @CurrentApiKey() apiKey: ApiKeyPayload,
    @Param('id') id: string,
    @Body() executeDto: ExecuteWorkflowDto,
  ) {
    // Si el id es 'current', usamos el workflowId de la API key
    const targetWorkflowId = id === 'current' ? apiKey.workflowId : id;

    const execution = await this.workflowsService.execute(
      apiKey.organizationId,
      targetWorkflowId,
      executeDto.input,
      executeDto.metadata,
      undefined, // userId (no aplica en ejecución por API key)
      apiKey.apiKeyId, // apiKeyId
    );

    // Transformar respuesta para ocultar metadata interna (DTO simplificado)
    const result = execution.result as any;
    const messages = result?.messages ?? [];
    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
    const assistantContent = lastMessage?.role === 'assistant' ? lastMessage.content : null;

    return {
      content: assistantContent,
      metadata: {
        execution_time_ms: result?.metadata?.execution_time_ms,
      },
    };
  }

  /**
   * POST /workflows/:id/execute/stream
   * Ejecutar un workflow en modo streaming usando API Key
   *
   * Headers requeridos:
   *   X-API-Key: ak_live_xxx...
   * Retorna: Content-Type: text/event-stream
   */
  @Post(':id/execute/stream')
  @UseGuards(ApiKeyGuard)
  @Header('Content-Type', 'text/event-stream')
  @Header('Cache-Control', 'no-cache')
  @Header('Connection', 'keep-alive')
  async executeStream(
    @CurrentApiKey() apiKey: ApiKeyPayload,
    @Param('id') id: string,
    @Body() executeDto: ExecuteWorkflowDto,
  ): Promise<StreamableFile> {
    // Si el id es 'current', usamos el workflowId de la API key
    const targetWorkflowId = id === 'current' ? apiKey.workflowId : id;

    const stream = await this.workflowsService.executeStream(
      apiKey.organizationId,
      targetWorkflowId,
      executeDto.input,
      executeDto.metadata,
      undefined, // userId
      apiKey.apiKeyId,
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
}
