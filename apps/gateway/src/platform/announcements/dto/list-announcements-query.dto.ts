import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { DEFAULT_PAGE_SIZE, AnnouncementStatus, MAX_PAGE_SIZE } from '@tesseract/types';

export class ListAnnouncementsQueryDto {
  @ApiPropertyOptional({ description: 'Filtrar por estado derivado.', enum: AnnouncementStatus })
  @IsOptional()
  @IsIn(Object.values(AnnouncementStatus))
  status?: AnnouncementStatus;

  @ApiPropertyOptional({ description: 'Filtrar por organización destino.' })
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional({ description: 'Página (1-indexed)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Elementos por página', default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;
}

export class AudiencePreviewQueryDto {
  @ApiPropertyOptional({ description: 'Ids de organización separados por coma. Ausente = todas.' })
  @IsOptional()
  @IsString()
  organizationIds?: string;

  @ApiPropertyOptional({ description: 'Roles separados por coma, ej: OWNER,ADMIN' })
  @IsOptional()
  @IsString()
  roles?: string;
}
