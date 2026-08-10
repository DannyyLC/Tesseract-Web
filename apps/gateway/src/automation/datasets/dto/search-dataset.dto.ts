import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { DatasetRangeFilter } from '@tesseract/types';

/**
 * Búsqueda sobre un dataset. La usan tanto el dashboard como la tool del agente.
 *
 * Los filtros vienen ya estructurados —no como un lenguaje de consulta libre— porque el modelo
 * recibe la firma tipada generada del schema: no puede pedir un valor de `select` que no exista,
 * ni comparar una columna de texto por rango. Un DSL abierto rendiría peor, porque un filtro
 * sintácticamente válido pero con un valor inexistente devuelve cero resultados sin ningún error,
 * y el agente acaba diciéndole al cliente que no hay lo que sí hay.
 */
export class SearchDatasetDto {
  @IsOptional()
  @IsObject()
  @ApiPropertyOptional({
    description: 'Valores por columna select. Varios valores en una columna son un OR.',
    example: { marca: ['Toyota', 'Ford'] },
  })
  select?: Record<string, string[]>;

  @IsOptional()
  @IsObject()
  @ApiPropertyOptional({
    description: 'Rangos por columna numérica o de fecha',
    example: { precio: { min: 200000, max: 300000 } },
  })
  range?: Record<string, DatasetRangeFilter>;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @ApiPropertyOptional({ description: 'Texto libre; barre todas las columnas de texto a la vez' })
  query?: string;

  @IsOptional()
  @IsString()
  @MaxLength(41)
  @ApiPropertyOptional({ description: 'Columna de orden; con guion inicial, descendente', example: '-precio' })
  sortBy?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @ApiPropertyOptional({ default: 20 })
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @ApiPropertyOptional({ default: 0 })
  offset?: number;
}
