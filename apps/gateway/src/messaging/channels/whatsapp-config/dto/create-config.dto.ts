import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

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

  @IsNotEmpty()
  @IsString()
  phoneNumber: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
