import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTenantToolDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'ID of the Tool Catalog item to instantiate' })
  toolCatalogId: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Custom display name for the organization', example: 'Google Calendar - Ventas' })
  displayName: string;

  @IsOptional()
  @ApiPropertyOptional({ description: 'Custom JSON configuration' })
  config?: Record<string, any>;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiPropertyOptional({ description: 'List of specific function names allowed for this instance' })
  allowedFunctions?: string[];
}
