import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { DEFAULT_PAGE_SIZE, EndUserBlockedFilter, MAX_PAGE_SIZE } from '@tesseract/types';

const BLOCKED_FILTERS: EndUserBlockedFilter[] = ['all', 'blocked', 'active'];

export class QueryEndUsersDto {
  @ApiPropertyOptional({ description: 'Cursor de paginación (id de la última fila vista)' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Dirección de la paginación', enum: ['next', 'prev'] })
  @IsOptional()
  @IsIn(['next', 'prev'])
  paginationAction?: 'next' | 'prev';

  @ApiPropertyOptional({ description: 'Tamaño de página', default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number;

  @ApiPropertyOptional({ description: 'Busca en nombre, email, identificador externo y teléfono' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Acota por estado de bloqueo', enum: BLOCKED_FILTERS })
  @IsOptional()
  @IsIn(BLOCKED_FILTERS)
  blocked?: EndUserBlockedFilter;
}
