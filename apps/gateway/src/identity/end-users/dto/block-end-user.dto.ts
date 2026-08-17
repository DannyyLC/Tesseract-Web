import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { BlockEndUserDto as IBlockEndUserDto } from '@tesseract/types';

export class BlockEndUserDto implements IBlockEndUserDto {
  /**
   * Opcional a propósito: obligarlo llena la columna de "x" y "spam", que no le dicen nada a
   * quien revise la lista después. Quien tiene algo que anotar, lo anota.
   */
  @ApiPropertyOptional({ description: 'Motivo del bloqueo, visible en el listado de contactos' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
