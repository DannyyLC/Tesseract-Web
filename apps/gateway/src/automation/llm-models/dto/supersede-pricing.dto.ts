import { IsNumber, IsOptional, IsString, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Cambio de precio versionado: cierra la fila de precio vigente y crea una
 * nueva fila activa. Los demás atributos del modelo (provider, modelName,
 * tier, contextWindow, etc.) se copian de la fila anterior.
 */
export class SupersedePricingDto {
  @ApiProperty({
    description: 'Nuevo precio por 1M tokens de entrada en USD',
    example: 3.0,
  })
  @IsNumber()
  @Min(0)
  inputPricePer1m: number;

  @ApiProperty({
    description: 'Nuevo precio por 1M tokens de salida en USD',
    example: 12.0,
  })
  @IsNumber()
  @Min(0)
  outputPricePer1m: number;

  @ApiPropertyOptional({
    description: 'Notas sobre el cambio de precio',
    example: 'Ajuste de precios Q3 2026',
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;
}
