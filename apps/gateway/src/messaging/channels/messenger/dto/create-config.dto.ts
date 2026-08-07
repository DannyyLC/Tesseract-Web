import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateConfigDto {
  @IsNotEmpty()
  @IsString()
  workflowId: string;

  /** Id de la página de Facebook que atiende este workflow. */
  @IsNotEmpty()
  @IsString()
  pageId: string;

  @IsOptional()
  @IsString()
  pageName?: string;

  /**
   * Token de acceso de la página. Se cifra antes de guardarse y nunca se devuelve.
   * Opcional: sin él se usa MESSENGER_PAGE_ACCESS_TOKEN.
   */
  @IsOptional()
  @IsString()
  pageAccessToken?: string;
}
