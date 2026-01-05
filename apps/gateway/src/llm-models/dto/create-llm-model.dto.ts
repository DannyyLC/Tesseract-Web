import {
  IsString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsDateString,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ModelTier } from '@prisma/client';

export class CreateLlmModelDto {
  @ApiProperty({
    description: 'Provider del modelo',
    example: 'openai',
    enum: ['openai', 'anthropic', 'google', 'meta', 'cohere'],
  })
  @IsString()
  @MaxLength(50)
  provider: string;

  @ApiProperty({
    description: 'Nombre del modelo',
    example: 'gpt-4o',
  })
  @IsString()
  @MaxLength(100)
  modelName: string;

  @ApiProperty({
    description: 'Tier del modelo',
    enum: ModelTier,
    example: 'STANDARD',
  })
  @IsEnum(ModelTier)
  tier: ModelTier;

  @ApiPropertyOptional({
    description: 'Categoría para agrupación en UI',
    example: 'respuesta-rapida',
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  category?: string;

  @ApiProperty({
    description: 'Precio por 1M tokens de entrada en USD',
    example: 2.5,
  })
  @IsNumber()
  @Min(0)
  inputPricePer1m: number;

  @ApiProperty({
    description: 'Precio por 1M tokens de salida en USD',
    example: 10.0,
  })
  @IsNumber()
  @Min(0)
  outputPricePer1m: number;

  @ApiProperty({
    description: 'Ventana de contexto máxima en tokens',
    example: 128000,
  })
  @IsNumber()
  @Min(1)
  contextWindow: number;

  @ApiProperty({
    description: 'Tokens recomendados para conversaciones',
    example: 100000,
  })
  @IsNumber()
  @Min(1)
  recommendedMaxTokens: number;

  @ApiPropertyOptional({
    description: 'Fecha desde la cual aplica este precio',
    example: '2025-01-01T00:00:00.000Z',
  })
  @IsDateString()
  @IsOptional()
  effectiveFrom?: string;

  @ApiPropertyOptional({
    description: 'Fecha hasta la cual aplica este precio (null = vigente)',
    example: null,
  })
  @IsDateString()
  @IsOptional()
  effectiveTo?: string;

  @ApiPropertyOptional({
    description: 'Si el modelo está activo',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Moneda del precio',
    example: 'USD',
    default: 'USD',
  })
  @IsString()
  @IsOptional()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({
    description: 'Notas adicionales sobre el precio',
    example: 'Aumento de precios Q1 2025',
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;
}
