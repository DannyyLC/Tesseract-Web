import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

/**
 * Edición de una página ya dada de alta.
 *
 * Todo es opcional: la pantalla manda solo lo que cambió. `pageId` también puede
 * cambiarse porque es la llave con la que el webhook entrante resuelve la config, pero
 * se recorta antes de guardar para evitar que el usuario deje espacios finales que
 * impiden match con los eventos de Meta.
 *
 * Las dos credenciales nunca salen del backend, de modo que el formulario las presenta
 * vacías; una cadena vacía significa "conserva la actual", no "bórrala".
 */
export class UpdateMessengerConfigDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  pageId?: string;

  @IsOptional()
  @IsString()
  pageName?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  appSecret?: string;

  @IsOptional()
  @IsString()
  pageAccessToken?: string;
}
