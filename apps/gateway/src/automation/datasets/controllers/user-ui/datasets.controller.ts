import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiResponseBuilder, DatasetField, UserRole } from '@tesseract/types';
import { HttpStatusCode } from 'axios';
import { Response } from 'express';
import { CurrentUser } from '@/identity/auth/decorators/current-user.decorator';
import { Roles } from '@/identity/auth/decorators/roles.decorator';
import { JwtAuthGuard } from '@/identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/identity/auth/guards/roles.guard';
import { UserPayload } from '@/platform/common/types/jwt-payload.type';
import { DatasetsService } from '../../core/datasets.service';
import { DatasetFieldsDto } from '../../dto/dataset-field.dto';
import {
  CreateDatasetDto,
  ImportDatasetCsvDto,
  ListDatasetRecordsQueryDto,
  UpdateDatasetDto,
  UpsertDatasetRecordDto,
} from '../../dto/dataset.dto';
import { SearchDatasetDto } from '../../dto/search-dataset.dto';

/**
 * Superficie de dashboard de los datasets.
 *
 * VIEWER puede leer; crear, editar el schema y capturar filas queda en OWNER/ADMIN, igual que el
 * resto de la configuración del workspace.
 */
@Controller('datasets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DatasetsController {
  constructor(private readonly datasetsService: DatasetsService) {}

  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  async list(@CurrentUser() user: UserPayload, @Res() res: Response) {
    const [datasets, usage] = await Promise.all([
      this.datasetsService.list(user.organizationId),
      this.datasetsService.getUsage(user.organizationId),
    ]);

    const apiResponse = new ApiResponseBuilder<{ datasets: typeof datasets; usage: typeof usage }>()
      .setData({ datasets, usage })
      .setMessage('Datasets retrieved successfully')
      .setSuccess(true);

    return res.status(HttpStatusCode.Ok).json(apiResponse.build());
  }

  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async create(
    @CurrentUser() user: UserPayload,
    @Body() body: CreateDatasetDto,
    @Res() res: Response,
  ) {
    const dataset = await this.datasetsService.create(user.organizationId, user.sub, {
      name: body.name,
      description: body.description,
      fields: body.fields as unknown as DatasetField[],
    });

    const apiResponse = new ApiResponseBuilder<typeof dataset>()
      .setData(dataset)
      .setMessage('Dataset created successfully')
      .setSuccess(true)
      .setStatusCode(HttpStatusCode.Created);

    return res.status(HttpStatusCode.Created).json(apiResponse.build());
  }

  @Get(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  async getById(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const dataset = await this.datasetsService.getById(user.organizationId, id);

    const apiResponse = new ApiResponseBuilder<typeof dataset>()
      .setData(dataset)
      .setMessage('Dataset retrieved successfully')
      .setSuccess(true);

    return res.status(HttpStatusCode.Ok).json(apiResponse.build());
  }

  @Put(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async update(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() body: UpdateDatasetDto,
    @Res() res: Response,
  ) {
    const dataset = await this.datasetsService.updateMeta(user.organizationId, id, body);

    const apiResponse = new ApiResponseBuilder<typeof dataset>()
      .setData(dataset)
      .setMessage('Dataset updated successfully')
      .setSuccess(true);

    return res.status(HttpStatusCode.Ok).json(apiResponse.build());
  }

  /**
   * Reemplaza la definición de columnas. Lo que se omite no se borra de verdad: queda marcado y
   * sus valores siguen en las filas, así que un borrado por error se deshace volviéndolo a mandar.
   */
  @Put(':id/fields')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async updateFields(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() body: DatasetFieldsDto,
    @Res() res: Response,
  ) {
    const dataset = await this.datasetsService.updateFields(
      user.organizationId,
      id,
      body.fields as unknown as DatasetField[],
    );

    const apiResponse = new ApiResponseBuilder<typeof dataset>()
      .setData(dataset)
      .setMessage('Dataset schema updated successfully')
      .setSuccess(true);

    return res.status(HttpStatusCode.Ok).json(apiResponse.build());
  }

  @Delete(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async remove(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    await this.datasetsService.remove(user.organizationId, id);

    const apiResponse = new ApiResponseBuilder<null>()
      .setMessage('Dataset deleted successfully')
      .setSuccess(true);

    return res.status(HttpStatusCode.Ok).json(apiResponse.build());
  }

  /**
   * Conecta el dataset a un workflow. Por detrás se crea o reutiliza la instancia de tool que el
   * agente consulta; el cliente solo ve que enlazó un catálogo.
   */
  @Post(':id/workflows/:workflowId')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async linkWorkflow(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Param('workflowId') workflowId: string,
    @Res() res: Response,
  ) {
    await this.datasetsService.linkWorkflow(user.organizationId, id, workflowId, user.sub);

    const apiResponse = new ApiResponseBuilder<null>()
      .setMessage('Dataset linked to workflow successfully')
      .setSuccess(true);

    return res.status(HttpStatusCode.Ok).json(apiResponse.build());
  }

  @Delete(':id/workflows/:workflowId')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async unlinkWorkflow(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Param('workflowId') workflowId: string,
    @Res() res: Response,
  ) {
    await this.datasetsService.unlinkWorkflow(user.organizationId, id, workflowId);

    const apiResponse = new ApiResponseBuilder<null>()
      .setMessage('Dataset unlinked from workflow successfully')
      .setSuccess(true);

    return res.status(HttpStatusCode.Ok).json(apiResponse.build());
  }

  // ==========================================
  // Filas
  // ==========================================

  @Get(':id/records')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  async listRecords(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Query() query: ListDatasetRecordsQueryDto,
    @Res() res: Response,
  ) {
    const result = await this.datasetsService.listRecords(
      user.organizationId,
      id,
      query.limit ?? 50,
      query.offset ?? 0,
    );

    const apiResponse = new ApiResponseBuilder<typeof result>()
      .setData(result)
      .setMessage('Records retrieved successfully')
      .setSuccess(true);

    return res.status(HttpStatusCode.Ok).json(apiResponse.build());
  }

  @Post(':id/records')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async createRecord(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() body: UpsertDatasetRecordDto,
    @Res() res: Response,
  ) {
    const record = await this.datasetsService.createRecord(user.organizationId, id, body.data);

    const apiResponse = new ApiResponseBuilder<typeof record>()
      .setData(record)
      .setMessage('Record created successfully')
      .setSuccess(true)
      .setStatusCode(HttpStatusCode.Created);

    return res.status(HttpStatusCode.Created).json(apiResponse.build());
  }

  @Put(':id/records/:recordId')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async updateRecord(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Param('recordId') recordId: string,
    @Body() body: UpsertDatasetRecordDto,
    @Res() res: Response,
  ) {
    const record = await this.datasetsService.updateRecord(
      user.organizationId,
      id,
      recordId,
      body.data,
    );

    const apiResponse = new ApiResponseBuilder<typeof record>()
      .setData(record)
      .setMessage('Record updated successfully')
      .setSuccess(true);

    return res.status(HttpStatusCode.Ok).json(apiResponse.build());
  }

  @Delete(':id/records/:recordId')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async deleteRecord(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Param('recordId') recordId: string,
    @Res() res: Response,
  ) {
    await this.datasetsService.deleteRecord(user.organizationId, id, recordId);

    const apiResponse = new ApiResponseBuilder<null>()
      .setMessage('Record deleted successfully')
      .setSuccess(true);

    return res.status(HttpStatusCode.Ok).json(apiResponse.build());
  }

  @Post(':id/import')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async importCsv(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() body: ImportDatasetCsvDto,
    @Res() res: Response,
  ) {
    const result = await this.datasetsService.importCsv(user.organizationId, id, body.csv);

    const apiResponse = new ApiResponseBuilder<typeof result>()
      .setData(result)
      .setMessage(
        result.failed > 0
          ? `Se importaron ${result.imported} filas y se rechazaron ${result.failed}`
          : `Se importaron ${result.imported} filas`,
      )
      .setSuccess(true);

    return res.status(HttpStatusCode.Ok).json(apiResponse.build());
  }

  /**
   * Búsqueda desde el dashboard, con el mismo motor que usa el agente. Sirve para que el cliente
   * compruebe qué va a encontrar su bot antes de conectarlo.
   */
  @Post(':id/search')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  async search(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() body: SearchDatasetDto,
    @Res() res: Response,
  ) {
    const result = await this.datasetsService.search(user.organizationId, id, body);

    const apiResponse = new ApiResponseBuilder<typeof result>()
      .setData(result)
      .setMessage('Search completed successfully')
      .setSuccess(true);

    return res.status(HttpStatusCode.Ok).json(apiResponse.build());
  }

  @Get(':id/values')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  async fieldValues(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Query('field') field: string,
    @Query('limit', new DefaultValuePipe(100)) limit: number,
    @Res() res: Response,
  ) {
    const result = await this.datasetsService.fieldValues(
      user.organizationId,
      id,
      field,
      Number(limit),
    );

    const apiResponse = new ApiResponseBuilder<typeof result>()
      .setData(result)
      .setMessage('Field values retrieved successfully')
      .setSuccess(true);

    return res.status(HttpStatusCode.Ok).json(apiResponse.build());
  }
}
