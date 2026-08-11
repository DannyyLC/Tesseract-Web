import { NotFoundException } from '@nestjs/common';
import { DatasetRequest } from '../../core/dataset-access.guard';
import { DatasetTokenClaims } from '../../core/dataset-token.service';
import { DatasetsService } from '../../core/datasets.service';
import { SearchDatasetDto } from '../../dto/search-dataset.dto';
import { DatasetQueryController } from './dataset-query.controller';

/**
 * La tesis de este archivo es una sola: el alcance sale del token y nunca de lo que manda el
 * llamador. Ninguna de las tres rutas recibe un `datasetId` por parámetro, así que lo único que hay
 * que sostener es que la organización y el catálogo que llegan al servicio son los del token —si un
 * refactor los tomara del body o de la URL, se abriría el paso de una organización a otra.
 */
describe('DatasetQueryController', () => {
  const claims: DatasetTokenClaims = {
    organizationId: 'org-1',
    datasetId: 'ds-1',
    workflowId: 'wf-1',
  };

  const mockDatasetsService: any = {
    search: jest.fn(),
    fieldValues: jest.fn(),
    getRecord: jest.fn(),
  };

  let controller: DatasetQueryController;

  /** El request tal como lo deja `DatasetAccessGuard` antes de llegar al handler. */
  const requestWith = (datasetClaims: DatasetTokenClaims) =>
    ({ datasetClaims }) as unknown as DatasetRequest;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDatasetsService.search.mockResolvedValue({ total: 0, items: [] });
    mockDatasetsService.fieldValues.mockResolvedValue({ field: 'marca', values: [] });
    mockDatasetsService.getRecord.mockResolvedValue(null);

    controller = new DatasetQueryController(mockDatasetsService as DatasetsService);
  });

  describe('search', () => {
    it('consulta la organización y el catálogo del token, y pasa el body tal cual', async () => {
      const body: SearchDatasetDto = { select: { marca: ['Toyota'] }, limit: 5 };

      await controller.search(requestWith(claims), body);

      expect(mockDatasetsService.search).toHaveBeenCalledWith('org-1', 'ds-1', body);
    });

    it('con el token de otra organización consulta esa otra, no la del token anterior', async () => {
      // El body no tiene por dónde influir: `SearchDatasetDto` no declara organización ni catálogo, y
      // el ValidationPipe global corre con `forbidNonWhitelisted`, así que un campo extra ni entra.
      const otro: DatasetTokenClaims = {
        organizationId: 'org-2',
        datasetId: 'ds-2',
        workflowId: 'wf-2',
      };

      await controller.search(requestWith(otro), {});

      expect(mockDatasetsService.search).toHaveBeenCalledWith('org-2', 'ds-2', {});
    });
  });

  describe('values', () => {
    it('propaga la columna con el alcance del token', async () => {
      await controller.values(requestWith(claims), 'marca', '10');

      expect(mockDatasetsService.fieldValues).toHaveBeenCalledWith('org-1', 'ds-1', 'marca', 10);
    });

    it('usa 100 cuando no viene limit', async () => {
      await controller.values(requestWith(claims), 'marca');

      expect(mockDatasetsService.fieldValues).toHaveBeenCalledWith('org-1', 'ds-1', 'marca', 100);
    });
  });

  describe('record', () => {
    it('devuelve la fila cuando existe', async () => {
      const fila = { id: 'r-1', data: { marca: 'Toyota' }, createdAt: new Date(), updatedAt: new Date() };
      mockDatasetsService.getRecord.mockResolvedValue(fila);

      await expect(controller.record(requestWith(claims), 'r-1')).resolves.toBe(fila);
      expect(mockDatasetsService.getRecord).toHaveBeenCalledWith('org-1', 'ds-1', 'r-1');
    });

    it('lanza 404 si la fila no es de este catálogo', async () => {
      // `getRecord` filtra por dataset y organización, así que un id de otra organización llega aquí
      // como `null`. El 404 no distingue "no existe" de "no es tuya", que es lo correcto: decirlo
      // confirmaría la existencia de filas ajenas.
      mockDatasetsService.getRecord.mockResolvedValue(null);

      await expect(controller.record(requestWith(claims), 'r-ajena')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
