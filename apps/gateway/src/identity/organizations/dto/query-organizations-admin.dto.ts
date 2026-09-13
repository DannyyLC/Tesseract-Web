import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ADMIN_PAGE_SIZE, MAX_PAGE_SIZE } from '@tesseract/types';

export class QueryOrganizationsAdminDto {
  @ApiPropertyOptional({ description: 'Búsqueda por nombre o slug', example: 'acme' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Filtrar por estado activo' })
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Página (1-indexed)', example: 1, default: 1 })
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
