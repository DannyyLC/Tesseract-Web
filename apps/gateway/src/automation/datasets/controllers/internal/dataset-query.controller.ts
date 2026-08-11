import { Body, Controller, Get, NotFoundException, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import {
  DatasetFieldValuesResponse,
  DatasetRecordDto,
  DatasetSearchResponse,
} from '@tesseract/types';
import { DatasetAccessGuard, DatasetRequest } from '../../core/dataset-access.guard';
import { DatasetsService } from '../../core/datasets.service';
import { SearchDatasetDto } from '../../dto/search-dataset.dto';

/**
 * Lo que consulta la tool del agente en tiempo de llamada.
 *
 * **Por qué existe este ida y vuelta** en vez de mandar las filas dentro del payload del workflow:
 * el schema son 30 columnas y cabe, pero las filas llegan a decenas de miles. Además así el dato
 * está vivo — el cliente corrige un precio y el siguiente mensaje ya lo usa, sin caché que invalidar.
 *
 * No hay `datasetId` en la ruta a propósito: sale del token, que es lo único que delimita a qué
 * organización y a qué catálogo puede llegar quien llama.
 *
 * El ThrottlerGuard global (20 req/60s por IP) no aplica: todas las llamadas salen del servicio de
 * agentes, o sea de un puñado de IPs que comparten todas las organizaciones, y una sola conversación
 * encadena una búsqueda, un listado de valores y varias fichas. Con el límite puesto, la ráfaga de un
 * cliente le gasta la cuota a otro que no tiene nada que ver. El 429 además no falla ruidosamente: la
 * tool lo devuelve como texto y el agente acaba diciéndole al cliente que no hay lo que sí hay, que es
 * justo el fallo que la firma tipada de la tool existe para evitar. Lo que protege este endpoint es el
 * token con alcance, no un límite por IP.
 */
@SkipThrottle()
@Controller('internal/datasets')
@UseGuards(DatasetAccessGuard)
export class DatasetQueryController {
  constructor(private readonly datasetsService: DatasetsService) {}

  @Post('search')
  async search(
    @Req() request: DatasetRequest,
    @Body() body: SearchDatasetDto,
  ): Promise<DatasetSearchResponse> {
    const { organizationId, datasetId } = request.datasetClaims!;

    return this.datasetsService.search(organizationId, datasetId, body);
  }

  @Get('values')
  async values(
    @Req() request: DatasetRequest,
    @Query('field') field: string,
    @Query('limit') limit?: string,
  ): Promise<DatasetFieldValuesResponse> {
    const { organizationId, datasetId } = request.datasetClaims!;

    return this.datasetsService.fieldValues(
      organizationId,
      datasetId,
      field,
      limit ? Number(limit) : 100,
    );
  }

  @Get('records/:recordId')
  async record(
    @Req() request: DatasetRequest,
    @Param('recordId') recordId: string,
  ): Promise<DatasetRecordDto> {
    const { organizationId, datasetId } = request.datasetClaims!;
    const record = await this.datasetsService.getRecord(organizationId, datasetId, recordId);

    if (!record) {
      throw new NotFoundException('Fila no encontrada');
    }

    return record;
  }
}
