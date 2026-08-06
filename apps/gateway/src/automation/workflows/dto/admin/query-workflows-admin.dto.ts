import { IsOptional, IsString, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

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
  @Type(() => Boolean)
  includeDeleted?: boolean;

  @ApiPropertyOptional({ description: 'Página (1-indexed)', example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ description: 'Elementos por página', example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  limit?: number;
}

export class QueryVersionsDto {
  @ApiPropertyOptional({ description: 'Página (1-indexed)', example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ description: 'Elementos por página', example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  limit?: number;
}
