import { IsOptional, IsString } from 'class-validator';

/**
 * Edición de una página ya dada de alta.
 *
 * Todo es opcional: la pantalla manda solo lo que cambió. `pageId` no está aquí a
 * propósito —es la llave con la que se resuelve la config del webhook entrante, así
 * que renombrar la página en Tesseract no puede moverla.
 *
 * Las dos credenciales nunca salen del backend, de modo que el formulario las presenta
 * vacías; una cadena vacía significa "conserva la actual", no "bórrala".
 */
export class UpdateMessengerConfigDto {
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
