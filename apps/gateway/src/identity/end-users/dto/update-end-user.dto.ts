import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UpdateEndUserDto as IUpdateEndUserDto } from '@tesseract/types';

export class UpdateEndUserDto implements IUpdateEndUserDto {
  /**
   * Único campo editable a propósito: el teléfono, el email y el externalId son la identidad
   * del contacto en su canal, y editarlos rompería el match con los mensajes que ya le llegaron.
   */
  @ApiProperty({ description: 'Nombre para mostrar del contacto' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;
}
