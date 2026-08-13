import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { DATASET_FIELD_TYPES, DatasetFieldType, MAX_FORMULA_LENGTH } from '@tesseract/types';

export class DatasetFieldDto {
  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description:
      'Clave interna, en snake_case. Si se omite se deriva del label. Inmutable una vez creada: ' +
      'es el nombre del parámetro que ve el modelo en la firma de la tool.',
    example: 'nivel_blindaje',
  })
  key?: string;

  @IsString()
  @MaxLength(80)
  @ApiProperty({ description: 'Nombre visible de la columna', example: 'Nivel de blindaje' })
  label: string;

  @IsIn(DATASET_FIELD_TYPES)
  @ApiProperty({
    description:
      'Define qué puede hacer el agente con la columna: select filtra por valores conocidos, ' +
      'number y date por rango y orden, text alimenta la búsqueda libre.',
    enum: DATASET_FIELD_TYPES,
  })
  type: DatasetFieldType;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(200)
  @ApiPropertyOptional({
    description: 'Opciones válidas, solo para type=select. Viajan dentro de la firma de la tool.',
    example: ['NIJ III', 'NIJ IV'],
  })
  options?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(MAX_FORMULA_LENGTH)
  @ApiPropertyOptional({
    description:
      'Solo para type=number. Convierte la columna en calculada: su valor se deriva de otras ' +
      'columnas numéricas al guardar la fila, en vez de capturarse. Referencia las columnas por su ' +
      'key. Operadores: + - * / y paréntesis; función round(valor, decimales).',
    example: 'round(precio_base * (1 + porcentaje / 100), 2)',
  })
  formula?: string;

  @IsOptional()
  @IsInt()
  @ApiPropertyOptional({ description: 'Orden de despliegue; si se omite se usa el del arreglo' })
  order?: number;
}

export class DatasetFieldsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DatasetFieldDto)
  @ApiProperty({
    type: [DatasetFieldDto],
    description:
      'Definición completa de columnas. Las que se omitan respecto del schema vigente quedan ' +
      'borradas lógicamente, conservando sus valores en las filas.',
  })
  fields: DatasetFieldDto[];
}
