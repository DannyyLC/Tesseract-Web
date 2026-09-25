import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { QueryBoolean } from '@/platform/common/decorators/query-boolean.decorator';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@tesseract/types';

export class QueryWorkflowsAdminDto {
  @ApiPropertyOptional({ description: 'Filtrar por organización' })
  @IsString()
  @IsOptional()
  organizationId?: string;

  @ApiPropertyOptional({ description: 'Búsqueda por nombre o descripción' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Incluir workflows borrados (soft delete)' })
  @IsBoolean()
  @IsOptional()
  @QueryBoolean()
  includeDeleted?: boolean;

  @ApiPropertyOptional({ description: 'Página (1-indexed)', example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: 'Elementos por página',
    example: DEFAULT_PAGE_SIZE,
    default: DEFAULT_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  // Sin techo, un `?limit=100000` convierte el listado en un volcado de la tabla.
  @Max(MAX_PAGE_SIZE)
  limit?: number;
}

export class QueryVersionsDto {
  @ApiPropertyOptional({ description: 'Página (1-indexed)', example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: 'Elementos por página',
    example: DEFAULT_PAGE_SIZE,
    default: DEFAULT_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  // Sin techo, un `?limit=100000` convierte el listado en un volcado de la tabla.
  @Max(MAX_PAGE_SIZE)
  limit?: number;
}
