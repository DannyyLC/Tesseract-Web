import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@tesseract/database';
import {
  DatasetField,
  DatasetFieldValuesResponse,
  DatasetRecordDto,
  DatasetSearchRequest,
  DatasetSearchResponse,
} from '@tesseract/types';
import { PrismaService } from '../../../platform/database/prisma.service';
import { liveFields } from './dataset-schema.validator';

/**
 * Traduce una búsqueda sobre un dataset a SQL contra la columna JSONB.
 *
 * Toda la consulta se arma con `Prisma.sql` y valores parametrizados: las únicas partes que se
 * interpolan como texto son las `key` de las columnas, que ya pasaron por `validateFields()` y solo
 * pueden contener `[a-z0-9_]`.
 *
 * **Por qué `@>` y no `->>` para los `select`:** el índice de `dataset_records` es
 * `GIN (data jsonb_path_ops)`, que solo acelera el operador de contención. Un
 * `data->>'marca' = 'Toyota'` daría el mismo resultado pero ignorando el índice.
 */

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

@Injectable()
export class DatasetQueryService {
  constructor(private readonly prismaService: PrismaService) {}

  async search(
    datasetId: string,
    fields: DatasetField[],
    request: DatasetSearchRequest,
  ): Promise<DatasetSearchResponse> {
    const where = this.buildWhere(datasetId, fields, request);
    const limit = Math.min(Math.max(request.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const offset = Math.max(request.offset ?? 0, 0);

    const [countRows, items] = await Promise.all([
      this.prismaService.$queryRaw<{ count: bigint }[]>(
        Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "dataset_records" WHERE ${where}`,
      ),
      this.prismaService.$queryRaw<DatasetRecordDto[]>(
        Prisma.sql`
          SELECT "id", "data", "createdAt", "updatedAt"
          FROM "dataset_records"
          WHERE ${where}
          ORDER BY ${this.buildOrderBy(fields, request.sortBy)}
          LIMIT ${limit} OFFSET ${offset}
        `,
      ),
    ]);

    return { total: Number(countRows[0]?.count ?? 0), items };
  }

  /**
   * Valores distintos de una columna, con su conteo.
   *
   * Es lo que contesta "¿qué marcas manejan?" y lo que desatasca los `select` con demasiadas
   * opciones para caber en la firma de la tool.
   */
  async fieldValues(
    datasetId: string,
    fields: DatasetField[],
    fieldKey: string,
    limit = 100,
  ): Promise<DatasetFieldValuesResponse> {
    const field = liveFields(fields).find((candidate) => candidate.key === fieldKey);

    if (!field) {
      throw new BadRequestException(`La columna "${fieldKey}" no existe en este dataset`);
    }

    const rows = await this.prismaService.$queryRaw<{ value: string; count: bigint }[]>(
      Prisma.sql`
        SELECT "data"->>${field.key} AS value, COUNT(*)::bigint AS count
        FROM "dataset_records"
        WHERE "datasetId" = ${datasetId} AND "data"->>${field.key} IS NOT NULL
        GROUP BY 1
        ORDER BY count DESC, value ASC
        LIMIT ${Math.min(limit, 500)}
      `,
    );

    return {
      field: field.key,
      values: rows.map((row) => ({ value: row.value, count: Number(row.count) })),
    };
  }

  private buildWhere(
    datasetId: string,
    fields: DatasetField[],
    request: DatasetSearchRequest,
  ): Prisma.Sql {
    const live = liveFields(fields);
    const byKey = new Map(live.map((field) => [field.key, field]));
    const conditions: Prisma.Sql[] = [Prisma.sql`"datasetId" = ${datasetId}`];

    for (const [key, values] of Object.entries(request.select ?? {})) {
      const field = byKey.get(key);

      if (!field || field.type !== 'select' || values.length === 0) {
        continue;
      }

      // Un OR de contenciones en vez de `@> ANY(...)`: así el planner puede combinar una lectura
      // de índice por valor (BitmapOr), que con ANY sobre un array no siempre consigue.
      const alternatives = values.map(
        (value) => Prisma.sql`"data" @> ${JSON.stringify({ [key]: value })}::jsonb`,
      );

      conditions.push(Prisma.sql`(${Prisma.join(alternatives, ' OR ')})`);
    }

    for (const [key, range] of Object.entries(request.range ?? {})) {
      const field = byKey.get(key);

      if (!field || (field.type !== 'number' && field.type !== 'date')) {
        continue;
      }

      // Las fechas se guardan como `YYYY-MM-DD`, que ordena y compara bien como texto: se evita
      // castear a date y con ello el riesgo de reventar contra un valor mal formado.
      const column =
        field.type === 'number'
          ? Prisma.sql`("data"->>${field.key})::numeric`
          : Prisma.sql`("data"->>${field.key})`;

      if (range.min !== undefined && range.min !== null) {
        const bound =
          field.type === 'number' ? Prisma.sql`${Number(range.min)}::numeric` : Prisma.sql`${String(range.min)}`;
        conditions.push(Prisma.sql`${column} >= ${bound}`);
      }

      if (range.max !== undefined && range.max !== null) {
        const bound =
          field.type === 'number' ? Prisma.sql`${Number(range.max)}::numeric` : Prisma.sql`${String(range.max)}`;
        conditions.push(Prisma.sql`${column} <= ${bound}`);
      }
    }

    const query = request.query?.trim();

    if (query) {
      const textFields = live.filter((field) => field.type === 'text');

      if (textFields.length > 0) {
        const pattern = `%${query.replace(/[%_\\]/g, (char) => `\\${char}`)}%`;
        const matches = textFields.map(
          (field) => Prisma.sql`"data"->>${field.key} ILIKE ${pattern}`,
        );

        conditions.push(Prisma.sql`(${Prisma.join(matches, ' OR ')})`);
      }
    }

    return Prisma.join(conditions, ' AND ');
  }

  /**
   * `precio` asciende, `-precio` desciende. Un `sortBy` que no corresponda a una columna ordenable
   * cae al orden de captura en vez de fallar: el modelo lo manda a veces mal y una consulta que
   * devuelve resultados en otro orden es mucho mejor que un error que corta la conversación.
   */
  private buildOrderBy(fields: DatasetField[], sortBy?: string): Prisma.Sql {
    const fallback = Prisma.sql`"createdAt" DESC`;

    if (!sortBy) {
      return fallback;
    }

    const descending = sortBy.startsWith('-');
    const key = descending ? sortBy.slice(1) : sortBy;
    const field = liveFields(fields).find((candidate) => candidate.key === key);

    if (!field || field.type === 'select') {
      return fallback;
    }

    const column =
      field.type === 'number'
        ? Prisma.sql`("data"->>${field.key})::numeric`
        : Prisma.sql`("data"->>${field.key})`;

    // NULLS LAST en ambas direcciones: una fila sin precio nunca debe encabezar "el más barato".
    return descending
      ? Prisma.sql`${column} DESC NULLS LAST`
      : Prisma.sql`${column} ASC NULLS LAST`;
  }
}
