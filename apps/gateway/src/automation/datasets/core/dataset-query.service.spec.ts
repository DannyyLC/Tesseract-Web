import { Prisma } from '@tesseract/database';
import { DatasetField, DatasetSearchRequest, MAX_DATASET_FIELDS } from '@tesseract/types';
import { PrismaService } from '../../../platform/database/prisma.service';
import { DatasetQueryService } from './dataset-query.service';

/**
 * Cubre la tokenización de `query` en `buildWhere()`: cada palabra debe encontrarse en alguna
 * columna de texto (AND entre palabras, OR entre columnas por palabra), normalizando acentos y
 * mayúsculas, sin abrir ninguna vía de concatenación de SQL sin bindear.
 */
describe('DatasetQueryService — búsqueda de texto libre', () => {
  const DATASET_ID = 'ds-1';

  const field = (overrides: Partial<DatasetField> & Pick<DatasetField, 'key' | 'type'>): DatasetField => ({
    label: overrides.key,
    order: 0,
    ...overrides,
  });

  const FIELDS: DatasetField[] = [field({ key: 'marca', type: 'text' }), field({ key: 'modelo', type: 'text' })];

  let mockPrismaService: { $queryRaw: jest.Mock };
  let service: DatasetQueryService;

  beforeEach(() => {
    mockPrismaService = { $queryRaw: jest.fn().mockResolvedValue([]) };
    service = new DatasetQueryService(mockPrismaService as unknown as PrismaService);
  });

  const search = (fields: DatasetField[], request: DatasetSearchRequest) => service.search(DATASET_ID, fields, request);

  /** `search()` dispara COUNT primero y SELECT después; ambas comparten el mismo WHERE. */
  const capturedWhere = (): Prisma.Sql => mockPrismaService.$queryRaw.mock.calls[1][0] as Prisma.Sql;

  it('multi-palabra: genera un AND de grupos OR, uno por token', async () => {
    await search(FIELDS, { query: 'BYD M9' });

    const where = capturedWhere();

    expect(where.values).toEqual(expect.arrayContaining(['%BYD%', '%BYD%', '%M9%', '%M9%']));
    expect(where.sql).toMatch(/LIKE.*OR.*LIKE.*\).*AND.*\(.*LIKE.*OR.*LIKE/s);
  });

  it('el orden de las palabras no importa', async () => {
    await search(FIELDS, { query: 'BYD M9' });
    const whereAB = capturedWhere();

    jest.clearAllMocks();
    mockPrismaService.$queryRaw.mockResolvedValue([]);

    await search(FIELDS, { query: 'M9 BYD' });
    const whereBA = capturedWhere();

    expect(new Set(whereAB.values)).toEqual(new Set(whereBA.values));
  });

  it('un solo token se comporta como antes: un solo grupo OR, sin AND adicional', async () => {
    await search(FIELDS, { query: 'sedán' });

    const where = capturedWhere();

    expect(where.values.filter((value) => value === '%sedán%')).toHaveLength(2);
    expect(where.sql).not.toMatch(/\).*AND.*\(.*LIKE/s);
  });

  it('normaliza acentos: "sedan" sin tilde compara vía translate(lower(...))', async () => {
    await search(FIELDS, { query: 'sedan' });

    const where = capturedWhere();

    expect(where.sql).toContain('translate(lower(');
    expect(where.values).toContain('%sedan%');
  });

  it('mayúsculas: "BYD" y "byd" generan el mismo SQL normalizado', async () => {
    await search(FIELDS, { query: 'byd' });
    const whereLower = capturedWhere();

    jest.clearAllMocks();
    mockPrismaService.$queryRaw.mockResolvedValue([]);

    await search(FIELDS, { query: 'BYD' });
    const whereUpper = capturedWhere();

    expect(whereLower.sql).toEqual(whereUpper.sql);
  });

  it('caracteres especiales de LIKE en el input viajan escapados', async () => {
    await search(FIELDS, { query: '%' });

    const where = capturedWhere();

    expect(where.values).toContain('%\\%%');
  });

  it('dataset sin columnas de texto: no agrega condición de búsqueda libre', async () => {
    const soloSelect: DatasetField[] = [field({ key: 'marca', type: 'select', options: ['BYD'] })];

    await search(soloSelect, { query: 'BYD M9' });

    const where = capturedWhere();

    expect(where.sql).not.toContain('LIKE');
  });

  it('límite de tokens: un query con más palabras que MAX_DATASET_FIELDS se trunca', async () => {
    const muchasPalabras = Array.from({ length: MAX_DATASET_FIELDS + 10 }, (_, index) => `p${index}`).join(' ');

    await search(FIELDS, { query: muchasPalabras });

    const where = capturedWhere();
    const andCount = (where.sql.match(/\) AND \(/g) ?? []).length;

    // MAX_DATASET_FIELDS tokens -> (MAX_DATASET_FIELDS - 1) "AND" entre grupos de palabra, más el
    // "AND" que une esta condición con "datasetId" = ... en el WHERE general.
    expect(andCount).toBeLessThanOrEqual(MAX_DATASET_FIELDS);
  });
});
