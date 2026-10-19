import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@tesseract/types';

export const WORKFLOW_INTEGRATION_FILTERS = ['all', 'linked', 'unlinked'] as const;
export type WorkflowIntegrationFilter = (typeof WORKFLOW_INTEGRATION_FILTERS)[number];

/**
 * Listado de integraciones de la pestaña "Integraciones" del editor de workflows.
 *
 * NO tiene `organizationId` a propósito: la organización sale siempre del workflow. Con
 * `forbidNonWhitelisted` global, mandarlo responde 400 en lugar de listar otro cliente.
 */
export class QueryWorkflowIntegrationsAdminDto {
  @ApiPropertyOptional({ description: 'Búsqueda por nombre de la integración o del catálogo' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    description: 'all, linked (vinculadas a este workflow) o unlinked',
    enum: WORKFLOW_INTEGRATION_FILTERS,
    default: 'all',
  })
  @IsOptional()
  @IsIn(WORKFLOW_INTEGRATION_FILTERS)
  filter?: WorkflowIntegrationFilter;

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
  @Max(MAX_PAGE_SIZE)
  limit?: number;
}
