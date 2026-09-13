import { BadRequestException } from '@nestjs/common';
import { DatasetField } from '@tesseract/types';
import { Logger } from 'winston';
import { EmailService } from '@/messaging/notifications/email/email.service';
import { PrismaService } from '../../../platform/database/prisma.service';
import { DatasetQueryService } from './dataset-query.service';
import { DatasetsService } from './datasets.service';

/**
 * Lo que se protege aquí es el recálculo masivo de las columnas calculadas: cuándo se dispara,
 * cuándo NO, y que la transacción esté configurada para sobrevivir a un catálogo grande.
 *
 * Es la parte del diseño donde un error no se nota: el schema queda guardado igual, y lo único que
 * pasa es que las filas conservan valores que ya no corresponden a la fórmula vigente.
 */
describe('DatasetsService', () => {
  const ORG_ID = 'org-1';
  const DATASET_ID = 'ds-1';

  const field = (
    overrides: Partial<DatasetField> & Pick<DatasetField, 'key' | 'type'>,
  ): DatasetField => ({
    label: overrides.key,
    order: 0,
    ...overrides,
  });

  const PRECIO_BASE = field({ key: 'precio_base', type: 'number', order: 0 });
  const PORCENTAJE = field({ key: 'porcentaje', type: 'number', order: 1 });
  const PRECIO_FINAL = field({
    key: 'precio_final',
    type: 'number',
    order: 2,
    formula: 'precio_base * (1 + porcentaje / 100)',
  });

  const mockTx: any = {
    dataset: { update: jest.fn() },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  };

  const mockPrismaService: any = {
    dataset: { findFirst: jest.fn(), update: jest.fn() },
    datasetRecord: {
      count: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    organization: { findUnique: jest.fn() },
    tenantTool: { findMany: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  };

  const mockQueryService: any = { search: jest.fn(), fieldValues: jest.fn() };
  const mockEmailService: any = { sendServiceRequestEmail: jest.fn() };
  const mockLogger: any = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

  let service: DatasetsService;

  /** El dataset tal como lo devuelve `loadOwned`. */
  const datasetWith = (fields: DatasetField[]) => ({
    id: DATASET_ID,
    organizationId: ORG_ID,
    name: 'Vehículos',
    description: null,
    fields,
    workflows: [],
    _count: { records: 0 },
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  /** Las filas que devuelve el paginado por keyset, seguidas de la página vacía que corta el bucle. */
  const givenRecords = (...pages: { id: string; data: Record<string, unknown> }[][]) => {
    pages.forEach((page) => mockTx.$queryRaw.mockResolvedValueOnce(page));
    mockTx.$queryRaw.mockResolvedValue([]);
  };

  /** Los parches jsonb que viajaron en el UPDATE, ya deserializados. */
  const patchesSent = (): Record<string, unknown>[] =>
    mockTx.$executeRaw.mock.calls.flatMap((call: any[]) =>
      (call[0].values as unknown[])
        .filter((value): value is string => typeof value === 'string' && value.startsWith('{'))
        .map((value) => JSON.parse(value)),
    );

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrismaService.$transaction.mockImplementation((arg: any) =>
      typeof arg === 'function' ? arg(mockTx) : Promise.all(arg),
    );
    service = new DatasetsService(
      mockPrismaService as PrismaService,
      mockQueryService as DatasetQueryService,
      mockEmailService as EmailService,
      mockLogger as Logger,
    );
  });

  describe('updateFields — cuándo se recalcula', () => {
    it('no recalcula nada si ninguna fórmula cambió', async () => {
      const fields = [PRECIO_BASE, PORCENTAJE, PRECIO_FINAL];
      mockPrismaService.dataset.findFirst.mockResolvedValue(datasetWith(fields));

      await service.updateFields(ORG_ID, DATASET_ID, [
        PRECIO_BASE,
        PORCENTAJE,
        { ...PRECIO_FINAL, label: 'Precio final (IVA)' }, // solo cambia el label
      ]);

      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
      expect(mockTx.$executeRaw).not.toHaveBeenCalled();
      expect(mockPrismaService.dataset.update).toHaveBeenCalled();
    });

    it('recalcula cuando se edita la fórmula', async () => {
      mockPrismaService.dataset.findFirst.mockResolvedValue(
        datasetWith([PRECIO_BASE, PORCENTAJE, PRECIO_FINAL]),
      );
      givenRecords([{ id: 'r1', data: { precio_base: 100, porcentaje: 10 } }]);

      await service.updateFields(ORG_ID, DATASET_ID, [
        PRECIO_BASE,
        PORCENTAJE,
        { ...PRECIO_FINAL, formula: 'precio_base * 2' },
      ]);

      expect(patchesSent()).toEqual([{ precio_final: 200 }]);
    });

    it('recalcula cuando se agrega una fórmula a una columna que no la tenía', async () => {
      mockPrismaService.dataset.findFirst.mockResolvedValue(
        datasetWith([PRECIO_BASE, PORCENTAJE, { ...PRECIO_FINAL, formula: undefined }]),
      );
      givenRecords([{ id: 'r1', data: { precio_base: 100, porcentaje: 10, precio_final: 999 } }]);

      await service.updateFields(ORG_ID, DATASET_ID, [PRECIO_BASE, PORCENTAJE, PRECIO_FINAL]);

      expect(patchesSent()).toEqual([{ precio_final: 110 }]);
    });

    /**
     * Quitar la fórmula convierte la columna en un número que se captura a mano; los últimos valores
     * calculados son justo lo que el cliente querrá seguir viendo. Recalcular aquí los vaciaría.
     */
    it('NO recalcula cuando se quita la fórmula', async () => {
      mockPrismaService.dataset.findFirst.mockResolvedValue(
        datasetWith([PRECIO_BASE, PORCENTAJE, PRECIO_FINAL]),
      );

      await service.updateFields(ORG_ID, DATASET_ID, [
        PRECIO_BASE,
        PORCENTAJE,
        { ...PRECIO_FINAL, formula: undefined },
      ]);

      expect(mockTx.$executeRaw).not.toHaveBeenCalled();
    });

    /**
     * La decisión de producto es que borrar una dependencia se permite y la calculada queda vacía.
     * Para que eso sea cierto en las filas que ya existen, hay que recalcular.
     */
    it('recalcula cuando se borra una columna de la que depende una fórmula', async () => {
      mockPrismaService.dataset.findFirst.mockResolvedValue(
        datasetWith([PRECIO_BASE, PORCENTAJE, PRECIO_FINAL]),
      );
      givenRecords([{ id: 'r1', data: { precio_base: 100, porcentaje: 10, precio_final: 110 } }]);

      // Se manda el schema sin `porcentaje`: mergeFields lo marca como borrado.
      await service.updateFields(ORG_ID, DATASET_ID, [PRECIO_BASE, PRECIO_FINAL]);

      expect(patchesSent()).toEqual([{ precio_final: null }]);
    });

    it('propaga en cascada a las fórmulas que dependen de otra fórmula', async () => {
      const base = field({ key: 'base', type: 'number', order: 0 });
      const conIva = field({ key: 'con_iva', type: 'number', order: 1, formula: 'base * 1.16' });
      const conEnvio = field({
        key: 'con_envio',
        type: 'number',
        order: 2,
        formula: 'con_iva + 500',
      });

      mockPrismaService.dataset.findFirst.mockResolvedValue(datasetWith([base, conIva, conEnvio]));
      givenRecords([{ id: 'r1', data: { base: 1000, con_iva: 1, con_envio: 1 } }]);

      await service.updateFields(ORG_ID, DATASET_ID, [
        base,
        { ...conIva, formula: 'base * 1.2' },
        conEnvio,
      ]);

      // `con_envio` se recalcula con el `con_iva` recién obtenido (1200), no con el que traía la fila.
      expect(patchesSent()).toEqual([{ con_iva: 1200, con_envio: 1700 }]);
    });
  });

  describe('updateFields — cómo escribe', () => {
    it('sube el timeout de la transacción muy por encima de los 5 s por defecto de Prisma', async () => {
      mockPrismaService.dataset.findFirst.mockResolvedValue(
        datasetWith([PRECIO_BASE, PORCENTAJE, PRECIO_FINAL]),
      );
      givenRecords([{ id: 'r1', data: { precio_base: 100, porcentaje: 10 } }]);

      await service.updateFields(ORG_ID, DATASET_ID, [
        PRECIO_BASE,
        PORCENTAJE,
        { ...PRECIO_FINAL, formula: 'precio_base * 3' },
      ]);

      const [, options] = mockPrismaService.$transaction.mock.calls[0];

      expect(options.timeout).toBeGreaterThan(60_000);
    });

    it('escribe por lotes: 2 500 filas son 3 UPDATE, no 2 500', async () => {
      const rows = (from: number, count: number) =>
        Array.from({ length: count }, (_, index) => ({
          id: `r${String(from + index).padStart(5, '0')}`,
          data: { precio_base: 100, porcentaje: 10 },
        }));

      mockPrismaService.dataset.findFirst.mockResolvedValue(
        datasetWith([PRECIO_BASE, PORCENTAJE, PRECIO_FINAL]),
      );
      givenRecords(rows(0, 1000), rows(1000, 1000), rows(2000, 500));

      await service.updateFields(ORG_ID, DATASET_ID, [
        PRECIO_BASE,
        PORCENTAJE,
        { ...PRECIO_FINAL, formula: 'precio_base * 3' },
      ]);

      expect(mockTx.$executeRaw).toHaveBeenCalledTimes(3);
    });

    /**
     * `data` tiene un índice GIN, así que cada UPDATE reescribe su entrada. Saltarse las filas cuyo
     * resultado no cambió es la mayor economía disponible en un recálculo.
     */
    it('no toca las filas cuyo valor calculado no cambió', async () => {
      mockPrismaService.dataset.findFirst.mockResolvedValue(
        datasetWith([PRECIO_BASE, PORCENTAJE, PRECIO_FINAL]),
      );
      givenRecords([
        { id: 'r1', data: { precio_base: 100, porcentaje: 10, precio_final: 300 } }, // ya vale lo nuevo
        { id: 'r2', data: { precio_base: 200, porcentaje: 10, precio_final: 1 } },
      ]);

      await service.updateFields(ORG_ID, DATASET_ID, [
        PRECIO_BASE,
        PORCENTAJE,
        { ...PRECIO_FINAL, formula: 'precio_base * 3' },
      ]);

      expect(patchesSent()).toEqual([{ precio_final: 600 }]);
    });

    it('deja en null la fila que no se puede evaluar, sin abortar el lote', async () => {
      mockPrismaService.dataset.findFirst.mockResolvedValue(
        datasetWith([PRECIO_BASE, PORCENTAJE, PRECIO_FINAL]),
      );
      givenRecords([
        // Sin precio base y con un valor calculado viejo: el resultado nuevo es null y hay que
        // escribirlo, porque dejar el viejo sería cotizar un precio que ya no sale de ninguna parte.
        { id: 'r1', data: { precio_base: null, porcentaje: 10, precio_final: 110 } },
        { id: 'r2', data: { precio_base: 100, porcentaje: 10 } },
      ]);

      await service.updateFields(ORG_ID, DATASET_ID, [
        PRECIO_BASE,
        PORCENTAJE,
        { ...PRECIO_FINAL, formula: 'precio_base * 3' },
      ]);

      expect(patchesSent()).toEqual([{ precio_final: null }, { precio_final: 300 }]);
    });
  });

  describe('importCsv', () => {
    beforeEach(() => {
      mockPrismaService.organization.findUnique.mockResolvedValue({
        plan: 'FREE',
        customMaxDatasets: null,
        customMaxDatasetRows: -1,
      });
      mockPrismaService.datasetRecord.count.mockResolvedValue(0);
      mockPrismaService.datasetRecord.createMany.mockResolvedValue({ count: 1 });
    });

    it('rechaza un CSV cuyas únicas coincidencias son columnas calculadas', async () => {
      mockPrismaService.dataset.findFirst.mockResolvedValue(
        datasetWith([PRECIO_BASE, PORCENTAJE, PRECIO_FINAL]),
      );

      // Sin excluir las calculadas del mapeo, este archivo pasaría el filtro e importaría filas
      // enteramente vacías: `precio_final` no se captura nunca.
      await expect(service.importCsv(ORG_ID, DATASET_ID, 'precio_final\n123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('ignora la columna calculada del archivo y guarda el valor de la fórmula', async () => {
      mockPrismaService.dataset.findFirst.mockResolvedValue(
        datasetWith([PRECIO_BASE, PORCENTAJE, PRECIO_FINAL]),
      );

      const result = await service.importCsv(
        ORG_ID,
        DATASET_ID,
        'precio_base,porcentaje,precio_final\n100,10,999999',
      );

      expect(result.imported).toBe(1);
      expect(mockPrismaService.datasetRecord.createMany).toHaveBeenCalledWith({
        data: [
          { datasetId: DATASET_ID, data: { precio_base: 100, porcentaje: 10, precio_final: 110 } },
        ],
      });
    });

    it('acepta el encabezado con otras mayúsculas y espacios en el borde', async () => {
      mockPrismaService.dataset.findFirst.mockResolvedValue(datasetWith([PRECIO_BASE, PORCENTAJE]));

      const result = await service.importCsv(
        ORG_ID,
        DATASET_ID,
        '  Precio_Base , PORCENTAJE \n100,10',
      );

      expect(result.imported).toBe(1);
      expect(result.ignoredColumns).toEqual([]);
    });

    it('reporta la columna que no coincide en vez de descartarla en silencio', async () => {
      mockPrismaService.dataset.findFirst.mockResolvedValue(datasetWith([PRECIO_BASE, PORCENTAJE]));

      // "precio base" con espacio no es `precio_base`: se ignora, y el cliente tiene que enterarse
      // o se queda con una importación "exitosa" que dejó la columna vacía.
      const result = await service.importCsv(
        ORG_ID,
        DATASET_ID,
        'precio base,porcentaje\n100,10',
      );

      expect(result.imported).toBe(1);
      expect(result.ignoredColumns).toEqual(['precio base']);
    });

    it('rechaza un archivo que no es texto plano por su formato, no por sus encabezados', async () => {
      mockPrismaService.dataset.findFirst.mockResolvedValue(datasetWith([PRECIO_BASE]));

      // Un .xlsx llega como el mojibake de leer un zip. Sin el corte por formato, el mensaje
      // hablaría de columnas que no coinciden y mandaría a revisar el encabezado equivocado.
      await expect(
        service.importCsv(ORG_ID, DATASET_ID, 'PK\x03\x04algo-binario-aqui'),
      ).rejects.toThrow(/no parece un CSV de texto/);
    });
  });

  describe('deleteRecords — borrado en lote', () => {
    it('acota el borrado al dataset, no solo a los ids recibidos', async () => {
      mockPrismaService.dataset.findFirst.mockResolvedValue(datasetWith([PRECIO_BASE]));
      mockPrismaService.datasetRecord.deleteMany.mockResolvedValue({ count: 2 });

      const result = await service.deleteRecords(ORG_ID, DATASET_ID, ['r1', 'r2']);

      // Sin el `datasetId` en el where, mandar ids de otro catálogo de la misma organización
      // bastaría para borrar sus filas desde esta pantalla.
      expect(mockPrismaService.datasetRecord.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['r1', 'r2'] }, datasetId: DATASET_ID },
      });
      expect(result).toEqual({ deleted: 2 });
    });

    it('no falla cuando las filas ya no existen', async () => {
      mockPrismaService.dataset.findFirst.mockResolvedValue(datasetWith([PRECIO_BASE]));
      mockPrismaService.datasetRecord.deleteMany.mockResolvedValue({ count: 0 });

      // Otra pestaña ya las borró. Eso no es un error de quien pidió el borrado: devolver 404 aquí
      // mostraría un fallo en la UI justo después de una operación que hizo lo que debía.
      await expect(service.deleteRecords(ORG_ID, DATASET_ID, ['r1'])).resolves.toEqual({
        deleted: 0,
      });
    });
  });

  /**
   * El borrado lógico es el punto donde el dataset y su tool se separan, y donde es fácil marcar
   * una y olvidar la otra: la relación con el workflow no la limpia `deletedAt`.
   */
  describe('remove', () => {
    it('desenlaza del workflow la tool del dataset, no solo la marca borrada', async () => {
      mockPrismaService.dataset.findFirst.mockResolvedValue(datasetWith([PRECIO_BASE]));
      mockPrismaService.tenantTool.findMany.mockResolvedValue([{ id: 'tt-1' }]);

      await service.remove(ORG_ID, DATASET_ID);

      const [{ data }] = mockPrismaService.tenantTool.update.mock.calls[0];

      expect(data.deletedAt).toBeInstanceOf(Date);
      // Sin este `set: []` la fila de `WorkflowToTenantTool` sobrevive al borrado, el tool muerto
      // sigue viajando en el payload del agente con la config a medias —sin `fields`, sin token—
      // y el runtime lo descarta: el agente se queda sin catálogo y sin explicación.
      expect(data.workflows).toEqual({ set: [] });
    });

    it('no rompe cuando el dataset nunca se enlazó a un workflow', async () => {
      mockPrismaService.dataset.findFirst.mockResolvedValue(datasetWith([PRECIO_BASE]));
      mockPrismaService.tenantTool.findMany.mockResolvedValue([]);

      await service.remove(ORG_ID, DATASET_ID);

      expect(mockPrismaService.tenantTool.update).not.toHaveBeenCalled();
      expect(mockPrismaService.dataset.update).toHaveBeenCalled();
    });
  });

  /**
   * Candado de la decisión de diseño: una columna calculada es `type: 'number'`. Si dejara de
   * serlo, el motor de consultas ordenaría los precios como texto y el servicio de agentes dejaría
   * de ofrecer el filtro por rango, ambos en silencio.
   */
  it('una columna calculada llega a la búsqueda como número', async () => {
    mockPrismaService.dataset.findFirst.mockResolvedValue(
      datasetWith([PRECIO_BASE, PORCENTAJE, PRECIO_FINAL]),
    );
    mockQueryService.search.mockResolvedValue({ total: 0, items: [] });

    await service.search(ORG_ID, DATASET_ID, { limit: 10 });

    const [, fields] = mockQueryService.search.mock.calls[0];

    expect(fields.find((f: DatasetField) => f.key === 'precio_final').type).toBe('number');
  });

  describe('listRecords — barra de búsqueda', () => {
    it('con query delega al motor de búsqueda (mismo resultado que vería el agente)', async () => {
      mockPrismaService.dataset.findFirst.mockResolvedValue(datasetWith([PRECIO_BASE]));
      mockQueryService.search.mockResolvedValue({ total: 1, items: [{ id: 'r1', data: {} }] });

      const result = await service.listRecords(ORG_ID, DATASET_ID, 50, 0, '  toyota  ');

      // El query se manda recortado; delega en el mismo DatasetQueryService.search() que usa
      // el agente, así que el resultado nunca puede divergir del que el bot vería.
      expect(mockQueryService.search).toHaveBeenCalledWith(
        DATASET_ID,
        expect.any(Array),
        expect.objectContaining({ query: 'toyota', limit: 50, offset: 0 }),
      );
      expect(result).toEqual({ total: 1, items: [{ id: 'r1', data: {} }] });
      expect(mockPrismaService.datasetRecord.count).not.toHaveBeenCalled();
    });

    it('sin query (o solo espacios) sigue el camino plano de siempre', async () => {
      mockPrismaService.dataset.findFirst.mockResolvedValue(datasetWith([PRECIO_BASE]));
      mockPrismaService.datasetRecord.count.mockResolvedValue(0);
      mockPrismaService.datasetRecord.findMany.mockResolvedValue([]);

      await service.listRecords(ORG_ID, DATASET_ID, 50, 0, '   ');

      expect(mockQueryService.search).not.toHaveBeenCalled();
      expect(mockPrismaService.datasetRecord.count).toHaveBeenCalled();
    });
  });
});
