import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ApiResponse, ApiResponseBuilder, UserRole } from '@tesseract/types';
import { JwtAuthGuard } from '@/identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/identity/auth/guards/roles.guard';
import { Roles } from '@/identity/auth/decorators/roles.decorator';
import { CurrentUser } from '@/identity/auth/decorators/current-user.decorator';
import { UserPayload } from '@/platform/common/types/jwt-payload.type';
import { WorkflowsAdminService } from '../../workflows-admin.service';
import {
  CloneWorkflowDto,
  CreateWorkflowAdminDto,
  QueryVersionsDto,
  QueryWorkflowsAdminDto,
  RestoreVersionDto,
  UpdateWorkflowConfigDto,
  UpdateWorkflowMetaDto,
  ValidateWorkflowConfigDto,
} from '../../dto/admin';

/**
 * Edición de workflows de cualquier cliente, para el super admin.
 *
 * Existe aparte del controlador de inquilino por dos razones: aquí la organización
 * es un parámetro y no viene del JWT (el super admin vive en la org `platform`), y
 * estas rutas sí devuelven el `config`, que el CRUD de inquilino oculta.
 */
@ApiTags('Admin - Workflows')
@ApiBearerAuth('access-token')
@Controller('admin/workflows')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class WorkflowsAdminController {
  constructor(private readonly workflowsAdminService: WorkflowsAdminService) {}

  /**
   * Va antes que `:id` a propósito: Nest resuelve por orden de declaración y si no,
   * capturaría "editor-context" como si fuera un id de workflow.
   */
  @Get('editor-context')
  @ApiOperation({ summary: 'Catálogo de nodos del motor + modelos LLM activos' })
  async editorContext(): Promise<ApiResponse> {
    const context = await this.workflowsAdminService.getEditorContext();
    return new ApiResponseBuilder().setData(context).build();
  }

  @Get()
  @ApiOperation({ summary: 'Listar workflows de cualquier organización (sin config)' })
  async findAll(@Query() query: QueryWorkflowsAdminDto): Promise<ApiResponse> {
    const result = await this.workflowsAdminService.findAll(query);
    return new ApiResponseBuilder().setData(result).build();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Workflow completo, incluyendo el config' })
  async findOne(@Param('id') id: string): Promise<ApiResponse> {
    const workflow = await this.workflowsAdminService.findOne(id);
    return new ApiResponseBuilder().setData(workflow).build();
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar metadata (no toca el config)' })
  async updateMeta(
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowMetaDto,
  ): Promise<ApiResponse> {
    const workflow = await this.workflowsAdminService.updateMeta(id, dto);
    return new ApiResponseBuilder().setData(workflow).setMessage('Workflow actualizado').build();
  }

  @Post(':id/config/validate')
  @ApiOperation({ summary: 'Validar un config sin guardarlo' })
  async validateConfig(
    @Param('id') _id: string,
    @Body() dto: ValidateWorkflowConfigDto,
  ): Promise<ApiResponse> {
    const result = await this.workflowsAdminService.validateConfig(dto.config);
    return new ApiResponseBuilder().setData(result).build();
  }

  @Put(':id/config')
  @ApiOperation({ summary: 'Guardar el config (bloqueo optimista + snapshot)' })
  async updateConfig(
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowConfigDto,
    @CurrentUser() user: UserPayload,
  ): Promise<ApiResponse> {
    const result = await this.workflowsAdminService.updateConfig(
      id,
      dto.config,
      dto.expectedVersion,
      { id: user?.sub, email: user?.email },
      { note: dto.note, expectedHash: dto.expectedHash },
    );

    return new ApiResponseBuilder()
      .setData(result)
      .setMessage(result.changed ? 'Config guardado' : 'Sin cambios que guardar')
      .build();
  }

  @Get(':id/versions')
  @ApiOperation({ summary: 'Historial de versiones (metadata, sin config)' })
  async listVersions(
    @Param('id') id: string,
    @Query() query: QueryVersionsDto,
  ): Promise<ApiResponse> {
    const result = await this.workflowsAdminService.listVersions(id, query);
    return new ApiResponseBuilder().setData(result).build();
  }

  @Get(':id/versions/:versionId')
  @ApiOperation({ summary: 'Config completo de una versión' })
  async getVersion(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ): Promise<ApiResponse> {
    const version = await this.workflowsAdminService.getVersion(id, versionId);
    return new ApiResponseBuilder().setData(version).build();
  }

  @Get(':id/versions/:versionId/diff')
  @ApiOperation({ summary: 'Diff de una versión contra el config vigente' })
  async diffVersion(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ): Promise<ApiResponse> {
    const diff = await this.workflowsAdminService.diffVersion(id, versionId);
    return new ApiResponseBuilder().setData(diff).build();
  }

  @Post(':id/versions/:versionId/restore')
  @ApiOperation({ summary: 'Restaurar una versión (crea una nueva, no borra historia)' })
  async restoreVersion(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @Body() dto: RestoreVersionDto,
    @CurrentUser() user: UserPayload,
  ): Promise<ApiResponse> {
    const result = await this.workflowsAdminService.restoreVersion(
      id,
      versionId,
      dto.expectedVersion,
      { id: user?.sub, email: user?.email },
      dto.note,
    );
    return new ApiResponseBuilder()
      .setData(result)
      .setMessage(result.changed ? 'Versión restaurada' : 'La versión ya era la vigente')
      .build();
  }

  @Post()
  @ApiOperation({ summary: 'Crear un workflow en cualquier organización' })
  async create(@Body() dto: CreateWorkflowAdminDto, @CurrentUser() user: UserPayload): Promise<ApiResponse> {
    const workflow = await this.workflowsAdminService.create(dto, {
      id: user?.sub,
      email: user?.email,
    });
    return new ApiResponseBuilder().setData(workflow).setMessage('Workflow creado').build();
  }

  @Post(':id/clone')
  @ApiOperation({ summary: 'Clonar un workflow hacia otra organización' })
  async clone(
    @Param('id') id: string,
    @Body() dto: CloneWorkflowDto,
    @CurrentUser() user: UserPayload,
  ): Promise<ApiResponse> {
    const result = await this.workflowsAdminService.clone(id, dto, {
      id: user?.sub,
      email: user?.email,
    });
    return new ApiResponseBuilder().setData(result).setMessage('Workflow clonado').build();
  }
}
