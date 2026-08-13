import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateConfigDto {
  @IsNotEmpty()
  @IsString()
  workflowId: string;

  /**
   * Id numérico de la página de Facebook que atiende este workflow. Obligatorio: es la
   * llave con la que el webhook entrante resuelve esta config, así que no se deriva de
   * ningún otro campo. Se recorta antes de validar porque se pega a mano desde Meta y un
   * espacio al final crearía una fila que ningún evento llega a emparejar.
   */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty()
  @IsString()
  pageId: string;

  @IsOptional()
  @IsString()
  pageName?: string;

  /** Nota interna del equipo. No la ve Meta ni influye en el canal. */
  @IsOptional()
  @IsString()
  description?: string;

  /**
   * Token de acceso de la página. Se cifra antes de guardarse y nunca se devuelve.
   * Opcional: sin él se usa MESSENGER_PAGE_ACCESS_TOKEN.
   */
  @IsOptional()
  @IsString()
  pageAccessToken?: string;

  /**
   * App secret de Meta, con el que se valida la firma de los webhooks de esta página.
   * Se cifra antes de guardarse y nunca se devuelve. Opcional: sin él se usa
   * MESSENGER_APP_SECRET.
   */
  @IsOptional()
  @IsString()
  appSecret?: string;
}
