import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { NormalizePhone } from '@/platform/common/utils/normalize-phone';

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
