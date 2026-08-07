import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RestoreVersionDto {
  /** Restaurar es solo otra edición, así que también pasa por el bloqueo optimista. */
  @ApiProperty({ description: 'Versión esperada del workflow (bloqueo optimista)' })
  @IsInt()
  @IsNotEmpty()
  expectedVersion!: number;

  @ApiPropertyOptional({ description: 'Nota del cambio, para el historial' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;
}
