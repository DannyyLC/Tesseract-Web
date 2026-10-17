import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';
import { NormalizePhone } from '@/platform/common/utils/normalize-phone';
import { WHATSAPP_PROVIDERS, WhatsAppProvider } from '../transporters/wb-transporter.interface';

export class CreateConfigDto {
  /**
   * Obligatorio: un número nace ligado a un workflow (desde la página del workflow con
   * el workflow ya fijo, o desde Canales de la organización eligiéndolo en el
   * formulario) — ver el comentario en `UpdateWhatsappConfigDto.workflowId` para la
   * reasignación/desasignación posterior, que sí sigue siendo opcional.
   */
  @IsNotEmpty()
  @IsString()
  workflowId: string;

  /**
   * Se guarda canónico (`+` y dígitos) para que el número tecleado a mano empate con el que manda
   * YCloud en el webhook. La columna es `@unique`, pero eso solo impide el duplicado idéntico: sin
   * normalizar, `+52 55 1234 5678` y `+525512345678` entran como dos números distintos.
   */
  @IsNotEmpty()
  @IsString()
  @NormalizePhone()
  phoneNumber: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

/**
 * Alta desde el super admin. Solo aquí se elige el proveedor y se cargan las credenciales:
 * `CreateConfigDto` (panel del cliente) no las acepta, así que un tenant no puede darse de alta
 * un número de Meta ni escribir en `sessionData`.
 *
 * Para `meta` los tres campos son obligatorios y terminan en `WhatsAppConfig.sessionData`
 * (`phoneNumberId`, `appSecret`, `accessToken`): es de donde los leen `MetaTransporter` y
 * `MetaPayloadConsumer`. Para `ycloud` no aplican y se ignoran.
 */
export class CreateAdminConfigDto extends CreateConfigDto {
  @IsOptional()
  @IsIn(WHATSAPP_PROVIDERS)
  provider?: WhatsAppProvider;

  @ValidateIf((o: CreateAdminConfigDto) => o.provider === 'meta')
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  phoneNumberId?: string;

  @ValidateIf((o: CreateAdminConfigDto) => o.provider === 'meta')
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  appSecret?: string;

  @ValidateIf((o: CreateAdminConfigDto) => o.provider === 'meta')
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  accessToken?: string;
}
