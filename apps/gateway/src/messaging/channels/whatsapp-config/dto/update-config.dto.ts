import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { NormalizePhone } from '@/platform/common/utils/normalize-phone';

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

/**
 * Edición desde el super admin. Es la única que puede cambiar `phoneNumber`: el panel del cliente
 * usa `UpdateWhatsappConfigDto`, sin él, porque ese valor es la llave con la que el webhook
 * resuelve la cuenta y un cambio equivocado deja los mensajes entrantes sin a dónde llegar.
 */
export class UpdateAdminWhatsappConfigDto extends UpdateWhatsappConfigDto {
  /** Canónico (`+` y dígitos), igual que al crear. Ausente = no lo toca. */
  @IsOptional()
  @IsString()
  @NormalizePhone()
  @Matches(/^\+\d{8,15}$/, { message: 'phoneNumber must be in E.164 format, e.g. +52234567890' })
  phoneNumber?: string;
  /**
   * Credenciales de Meta (`WhatsAppConfig.sessionData`). Parciales: lo ausente no se toca, así se
   * puede rotar solo el token sin volver a capturar el app secret, que la API nunca devuelve.
   * Un string vacío es un error (no borra nada): para conservar el valor, no se manda.
   * Solo aplican a un número con `provider = 'meta'`; el controlador lo verifica.
   */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  phoneNumberId?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  appSecret?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  accessToken?: string;
}
