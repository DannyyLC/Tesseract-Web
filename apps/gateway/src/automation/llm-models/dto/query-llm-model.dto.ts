import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ModelTier } from '@tesseract/database';
import { Type } from 'class-transformer';
import { ADMIN_PAGE_SIZE, MAX_PAGE_SIZE } from '@tesseract/types';

export class QueryLlmModelsDto {
  @ApiPropertyOptional({
    description: 'Búsqueda por proveedor o nombre de modelo',
    example: 'openai',
  })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por tier',
    enum: ModelTier,
  })
  @IsEnum(ModelTier)
  @IsOptional()
  tier?: ModelTier;

  @ApiPropertyOptional({
    description: 'Filtrar por estado activo',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Filtrar por ID de categoría del modelo LLM',
  })
  @IsString()
  @IsOptional()
  llmCategoryId?: string;

  @ApiPropertyOptional({
    description: 'Página (1-indexed)',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: 'Elementos por página',
    example: ADMIN_PAGE_SIZE,
    default: ADMIN_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  // Sin techo, un `?limit=100000` convierte el listado en un volcado de la tabla.
  @Max(MAX_PAGE_SIZE)
  limit?: number;
}
