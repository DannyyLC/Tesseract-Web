import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { UpdateAnnouncementDto as IUpdateAnnouncementDto } from '@tesseract/types';
import { IsCtaUrl } from './cta-url.validator';

/**
 * `title`/`message`/`titleEn`/`messageEn` solo se aplican mientras `fannedOutAt` sea null
 * (el servicio responde 409 si no): pasado ese punto el modal y la campana leen los
 * SNAPSHOTS de `UserNotification`, no estos campos, así que editarlos no cambiaría nada
 * para quien ya lo recibió mientras dejaría la lista del admin mintiendo.
 *
 * `ctaLabel`/`ctaUrl`/`expiresAt` sí se leen en vivo y por tanto siguen editables después
 * del envío — útil para corregir un enlace roto sin reenviar el anuncio.
 */
export class UpdateAnnouncementDto implements IUpdateAnnouncementDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  titleEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  messageEn?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(60)
  ctaLabel?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(60)
  ctaLabelEn?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsCtaUrl()
  ctaUrl?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsISO8601()
  expiresAt?: string | null;
}
