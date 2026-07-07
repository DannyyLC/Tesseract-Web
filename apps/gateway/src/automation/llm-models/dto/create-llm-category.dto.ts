import { IsString, IsOptional, IsBoolean, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLlmCategoryDto {
  @ApiProperty({ description: 'Nombre canónico de la categoría', example: 'chat' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ description: 'Descripción de la categoría' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Si la categoría está activa', default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
