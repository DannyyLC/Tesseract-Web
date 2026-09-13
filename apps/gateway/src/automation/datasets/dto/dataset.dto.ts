import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MAX_DATASET_FIELDS } from '@tesseract/types';
import { DatasetFieldDto } from './dataset-field.dto';

export class CreateDatasetDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @ApiProperty({ description: 'Nombre del dataset', example: 'Vehículos blindados' })
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ApiPropertyOptional({
    description:
      'Para qué sirve. Se inyecta en la descripción de la tool, así que es lo que le dice al ' +
      'modelo cuándo consultarlo.',
    example: 'Catálogo de unidades blindadas disponibles, con su nivel de protección y precio.',
  })
  description?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_DATASET_FIELDS)
  @ValidateNested({ each: true })
  @Type(() => DatasetFieldDto)
  @ApiProperty({ type: [DatasetFieldDto] })
  fields: DatasetFieldDto[];
}

export class UpdateDatasetDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @ApiPropertyOptional()
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ApiPropertyOptional()
  description?: string | null;
}

export class UpsertDatasetRecordDto {
  @IsObject()
  @ApiProperty({
    description: 'Valores de la fila, indexados por la clave de cada columna',
    example: { marca: 'Toyota', precio: 320000, anio: 2024 },
  })
  data: Record<string, unknown>;
}

export class ImportDatasetCsvDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description:
      'Contenido del archivo CSV como texto. El navegador lo lee y lo manda aquí; el encabezado ' +
      'puede usar las claves o los nombres visibles de las columnas.',
  })
  csv: string;

  /**
   * Nombre del archivo que eligió el cliente.
   *
   * Solo sirve para rechazar el descuido honesto —alguien que subió el `.xlsx`— porque es un dato
   * que el propio cliente manda. La comprobación que de verdad protege al servidor es
   * `looksLikeCsvText()` sobre el contenido, en `importCsv`.
   */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Matches(/\.csv$/i, { message: 'El archivo debe tener extensión .csv' })
  @ApiPropertyOptional({ description: 'Nombre del archivo elegido, para validar su extensión' })
  fileName?: string;
}

export class BulkDeleteDatasetRecordsDto {
  @IsArray()
  @ArrayMinSize(1)
  // La selección de la rejilla abarca solo la página visible, hoy de 50 filas. El tope deja holgura
  // de sobra sin dejar que la lista crezca sin límite.
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @ApiProperty({ type: [String], description: 'IDs de las filas seleccionadas para eliminar' })
  recordIds: string[];
}

export class RequestWorkflowConnectionDto {
  @IsArray()
  @ArrayMinSize(1)
  // Un solo correo alcanza para varias filas: el tope es para no dejar que la lista crezca sin
  // límite, no porque haga falta uno tan bajo.
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @ApiProperty({ type: [String], description: 'IDs de los workflows cuya conexión se solicita' })
  workflowIds: string[];
}

export class ListDatasetRecordsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({ default: 50 })
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @ApiPropertyOptional({ default: 0 })
  offset?: number;

  /** Texto libre: mismo motor que `search_dataset`, barre las columnas `text` del catálogo. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @ApiPropertyOptional()
  query?: string;
}
