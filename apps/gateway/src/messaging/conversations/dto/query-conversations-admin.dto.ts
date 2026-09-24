import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@tesseract/types';

export class QueryConversationsAdminDto {
  @ApiProperty({ description: 'Organización dueña del workflow' })
  @IsUUID()
  organizationId!: string;

  @ApiProperty({ description: 'Workflow del que se listan las conversaciones' })
  @IsUUID()
  workflowId!: string;

  @ApiPropertyOptional({ description: 'Cursor de paginación (id de la última fila vista)' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Tamaño de página', default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  take?: number;

  @ApiPropertyOptional({ description: 'Solo conversaciones con al menos una ejecución fallida' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  onlyErrors?: boolean;
}
