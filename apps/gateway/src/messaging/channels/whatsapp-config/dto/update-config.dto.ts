import { IsBoolean, IsOptional, IsString } from 'class-validator';

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

  /**
   * Solo importa cuando el workflow tiene más de un número: cuál usa `send_bulk_whatsapp` como
   * remitente para templates si la conversación no es por WhatsApp. `true` le quita la marca a
   * cualquier otro número del mismo workflow (a lo más uno puede ser default); `false` la borra
   * sin marcar a otro (cae al primero de la lista).
   */
  @IsOptional()
  @IsBoolean()
  isDefaultForOutbound?: boolean;
}
