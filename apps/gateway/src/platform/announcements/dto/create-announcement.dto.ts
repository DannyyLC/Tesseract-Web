import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  AnnouncementTemplateKind,
  CreateAnnouncementDto as ICreateAnnouncementDto,
  UserRole,
} from '@tesseract/types';
import { IsCtaUrl } from './cta-url.validator';

// SUPER_ADMIN nunca es destinatario: es operador de plataforma, no inquilino.
const ANNOUNCEABLE_ROLES = [UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER];

export class CreateAnnouncementDto implements ICreateAnnouncementDto {
  @ApiProperty({ description: 'Título en español. Obligatorio.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({ description: 'Cuerpo en español. Obligatorio.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message: string;

  @ApiPropertyOptional({ description: 'Título en inglés. Si se omite, se usa el español.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  titleEn?: string;

  @ApiPropertyOptional({ description: 'Cuerpo en inglés. Si se omite, se usa el español.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  messageEn?: string;

  @ApiProperty({ description: 'Plantilla visual.', enum: AnnouncementTemplateKind })
  @IsIn(Object.values(AnnouncementTemplateKind))
  template: AnnouncementTemplateKind;

  @ApiPropertyOptional({ description: 'Texto del botón de acción (español).' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  ctaLabel?: string;

  @ApiPropertyOptional({ description: 'Texto del botón de acción (inglés).' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  ctaLabelEn?: string;

  @ApiPropertyOptional({
    description: 'Ruta relativa ("/billing") o URL absoluta https:// del botón de acción.',
  })
  @IsOptional()
  @IsCtaUrl()
  ctaUrl?: string;

  @ApiPropertyOptional({
    description: 'Organización destino. Ausente/null = todas las organizaciones.',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  targetOrganizationId?: string | null;

  @ApiProperty({
    description: 'Roles destino. SUPER_ADMIN nunca puede incluirse.',
    enum: ANNOUNCEABLE_ROLES,
    isArray: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(ANNOUNCEABLE_ROLES, { each: true })
  targetRoles: UserRole[];

  @ApiPropertyOptional({
    description: 'Caducidad (ISO 8601). Apaga el modal pero no borra el historial de la campana.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsISO8601()
  expiresAt?: string | null;

  @ApiProperty({ description: 'Si es true, se publica y se envía de inmediato.' })
  @IsBoolean()
  publishNow: boolean;
}
