import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ADMIN_TENANT_TOOL_SEGMENTS,
  type AdminTenantToolSegment,
} from '../admin-tenant-tool-segments';

export class QueryTenantToolsAdminDto {
  @ApiPropertyOptional({
    description: 'Búsqueda por nombre o id (para ubicar a qué organización pertenece)',
    example: 'HubSpot',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description:
      'Filtrar por organización — para acotar antes de copiar un id y evitar vincular por error la tool de otra organización a un workflow.',
  })
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional({
    description:
      'Segmento de las tarjetas del listado: connected, problem (error o autorización vencida) o unattached (conectada sin workflows)',
    enum: ADMIN_TENANT_TOOL_SEGMENTS,
  })
  @IsOptional()
  @IsIn(ADMIN_TENANT_TOOL_SEGMENTS)
  segment?: AdminTenantToolSegment;

  @ApiPropertyOptional({ description: 'Página (1-indexed)', example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ description: 'Elementos por página', example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  limit?: number;
}
