import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiResponse, ApiResponseBuilder, DatasetField, UserRole } from '@tesseract/types';
import { CurrentUser } from '@/identity/auth/decorators/current-user.decorator';
import { Roles } from '@/identity/auth/decorators/roles.decorator';
import { JwtAuthGuard } from '@/identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/identity/auth/guards/roles.guard';
import { UserPayload } from '@/platform/common/types/jwt-payload.type';
import { DatasetsService } from '../../core/datasets.service';
import { DatasetFieldsDto } from '../../dto/dataset-field.dto';
import {
  BulkDeleteDatasetRecordsDto,
  CreateDatasetDto,
  ImportDatasetCsvDto,
  ListDatasetRecordsQueryDto,
  UpdateDatasetDto,
  UpsertDatasetRecordDto,
} from '../../dto/dataset.dto';

/**
 * Edición de catálogos (datasets) de cualquier cliente, para el super admin.
 *
 * Existe aparte del controlador de dashboard por la misma razón que `WorkflowsAdminController`:
 * aquí la organización es un parámetro de ruta y no viene del JWT (el super admin vive en la
 * org `platform`). Delega 1:1 en `DatasetsService` — la misma lógica que ya usa el cliente,
 * scoping por `organizationId` incluido — para que lo que edite un admin sea exactamente lo que
 * el cliente vería en su propio dashboard.
 *
 * Sin bitácora de auditoría por decisión explícita: protegido solo por rol SUPER_ADMIN.
 */
@ApiTags('Admin - Datasets')
@ApiBearerAuth('access-token')
@Controller('admin/organizations/:organizationId/datasets')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class DatasetsAdminController {
  constructor(private readonly datasetsService: DatasetsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar catálogos de una organización, con su uso de plan' })
  async list(@Param('organizationId') organizationId: string): Promise<ApiResponse> {
    const [datasets, usage] = await Promise.all([
      this.datasetsService.list(organizationId),
      this.datasetsService.getUsage(organizationId),
    ]);
    return new ApiResponseBuilder().setData({ datasets, usage }).build();
  }

  @Post()
  @ApiOperation({ summary: 'Crear un catálogo en la organización' })
  async create(
    @Param('organizationId') organizationId: string,
    @Body() body: CreateDatasetDto,
    @CurrentUser() user: UserPayload,
  ): Promise<ApiResponse> {
    const dataset = await this.datasetsService.create(organizationId, user.sub, {
      name: body.name,
      description: body.description,
      fields: body.fields as unknown as DatasetField[],
    });
    return new ApiResponseBuilder().setData(dataset).setMessage('Catálogo creado').build();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un catálogo' })
  async getById(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ): Promise<ApiResponse> {
    const dataset = await this.datasetsService.getById(organizationId, id);
    return new ApiResponseBuilder().setData(dataset).build();
  }

  @Put(':id')
  @ApiOperation({ summary: 'Editar nombre/descripción de un catálogo' })
  async update(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() body: UpdateDatasetDto,
  ): Promise<ApiResponse> {
    const dataset = await this.datasetsService.updateMeta(organizationId, id, body);
    return new ApiResponseBuilder().setData(dataset).setMessage('Catálogo actualizado').build();
  }

  @Put(':id/fields')
  @ApiOperation({ summary: 'Reemplazar la definición de columnas de un catálogo' })
  async updateFields(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() body: DatasetFieldsDto,
  ): Promise<ApiResponse> {
    const dataset = await this.datasetsService.updateFields(
      organizationId,
      id,
      body.fields as unknown as DatasetField[],
    );
    return new ApiResponseBuilder().setData(dataset).setMessage('Columnas actualizadas').build();
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un catálogo (soft delete)' })
  async remove(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ): Promise<ApiResponse> {
    await this.datasetsService.remove(organizationId, id);
    return new ApiResponseBuilder().setMessage('Catálogo eliminado').build();
  }

  @Post(':id/workflows/:workflowId')
  @ApiOperation({ summary: 'Vincular un catálogo a un workflow de la misma organización' })
  async linkWorkflow(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Param('workflowId') workflowId: string,
  ): Promise<ApiResponse> {
    // Sin userId a propósito: el super admin no es miembro de esta organización (vive en
    // `platform`), así que no debe quedar como "creador" de la tenant tool — eso bloquearía a
    // los ADMIN reales de la organización para tocarla después (ver el comentario en
    // DatasetsService.ensureTenantTool()).
    await this.datasetsService.linkWorkflow(organizationId, id, workflowId);
    return new ApiResponseBuilder().setMessage('Catálogo vinculado al workflow').build();
  }

  @Delete(':id/workflows/:workflowId')
  @ApiOperation({ summary: 'Desvincular un catálogo de un workflow' })
  async unlinkWorkflow(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Param('workflowId') workflowId: string,
  ): Promise<ApiResponse> {
    await this.datasetsService.unlinkWorkflow(organizationId, id, workflowId);
    return new ApiResponseBuilder().setMessage('Catálogo desvinculado del workflow').build();
  }

  @Get(':id/records')
  @ApiOperation({ summary: 'Listar filas de un catálogo (paginado)' })
  async listRecords(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Query() query: ListDatasetRecordsQueryDto,
  ): Promise<ApiResponse> {
    const result = await this.datasetsService.listRecords(
      organizationId,
      id,
      query.limit ?? 50,
      query.offset ?? 0,
      query.query,
    );
    return new ApiResponseBuilder().setData(result).build();
  }

  @Post(':id/records')
  @ApiOperation({ summary: 'Crear una fila' })
  async createRecord(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() body: UpsertDatasetRecordDto,
  ): Promise<ApiResponse> {
    const record = await this.datasetsService.createRecord(organizationId, id, body.data);
    return new ApiResponseBuilder().setData(record).setMessage('Fila creada').build();
  }

  @Put(':id/records/:recordId')
  @ApiOperation({ summary: 'Editar una fila' })
  async updateRecord(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Param('recordId') recordId: string,
    @Body() body: UpsertDatasetRecordDto,
  ): Promise<ApiResponse> {
    const record = await this.datasetsService.updateRecord(organizationId, id, recordId, body.data);
    return new ApiResponseBuilder().setData(record).setMessage('Fila actualizada').build();
  }

  @Delete(':id/records/:recordId')
  @ApiOperation({ summary: 'Eliminar una fila' })
  async deleteRecord(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Param('recordId') recordId: string,
  ): Promise<ApiResponse> {
    await this.datasetsService.deleteRecord(organizationId, id, recordId);
    return new ApiResponseBuilder().setMessage('Fila eliminada').build();
  }

  /**
   * `POST` y no `DELETE`: el borrado en lote manda la lista de ids en el body, y
   * `DELETE :id/records/:recordId` capturaría un `DELETE :id/records/bulk` con `recordId = 'bulk'`.
   */
  @Post(':id/records/bulk-delete')
  @ApiOperation({ summary: 'Eliminar varias filas por id' })
  async deleteRecords(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() body: BulkDeleteDatasetRecordsDto,
  ): Promise<ApiResponse> {
    const result = await this.datasetsService.deleteRecords(organizationId, id, body.recordIds);
    return new ApiResponseBuilder().setData(result).setMessage('Filas eliminadas').build();
  }

  @Delete(':id/records')
  @ApiOperation({
    summary: 'Vaciar un catálogo: borra todas sus filas, conserva el catálogo y sus columnas',
  })
  async clearRecords(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ): Promise<ApiResponse> {
    const result = await this.datasetsService.clearRecords(organizationId, id);
    return new ApiResponseBuilder().setData(result).setMessage('Filas eliminadas').build();
  }

  @Post(':id/import')
  @ApiOperation({ summary: 'Importar filas desde CSV' })
  async importCsv(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() body: ImportDatasetCsvDto,
  ): Promise<ApiResponse> {
    const result = await this.datasetsService.importCsv(organizationId, id, body.csv);
    return new ApiResponseBuilder()
      .setData(result)
      .setMessage(
        result.failed > 0
          ? `Se importaron ${result.imported} filas y se rechazaron ${result.failed}`
          : `Se importaron ${result.imported} filas`,
      )
      .build();
  }
}
