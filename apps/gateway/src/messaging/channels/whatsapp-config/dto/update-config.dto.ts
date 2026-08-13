import { IsOptional, IsString } from 'class-validator';

/**
 * Edición de un número ya dado de alta.
 *
 * Solo datos de presentación: `phoneNumber` no está aquí porque es la llave con la que
 * se resuelve la config del webhook entrante, y cambiarlo desde esta pantalla dejaría
 * los mensajes en curso sin cuenta a la que asociarse.
 */
export class UpdateWhatsappConfigDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
