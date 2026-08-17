import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

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

  @ApiPropertyOptional({ description: 'Tamaño de página', default: 20 })
  @IsOptional()
  @Type(() => Number)
  take?: number;

  @ApiPropertyOptional({ description: 'Solo conversaciones con al menos una ejecución fallida' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  onlyErrors?: boolean;
}
