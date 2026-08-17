import { IsOptional, IsString } from 'class-validator';

/**
 * Edición de un número ya dado de alta.
 *
 * `phoneNumber` no está aquí porque es la llave con la que se resuelve la config del
 * webhook entrante, y cambiarlo desde esta pantalla dejaría los mensajes en curso sin
 * cuenta a la que asociarse.
 *
 * `workflowId` es tri-estado, igual que los límites custom de organización: ausente =
 * no lo toca, `null` = desasigna el workflow por defecto (el número queda dado de alta
 * pero sin ruteo, como antes de asignarlo), string = lo reasigna. Antes esto no existía
 * y la única forma de "mover" un número era borrarlo y crearlo de nuevo, perdiendo sus
 * templates (cascada) y la verificación ya hecha con Meta.
 */
export class UpdateWhatsappConfigDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  workflowId?: string | null;
}
