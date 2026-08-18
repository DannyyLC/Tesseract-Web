import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import {
  CFDI_USE_CODES,
  MEXICAN_ZIP_PATTERN,
  RFC_PATTERN,
  TAX_REGIME_CODES,
} from '@tesseract/types';
import { NormalizeEmail } from '@/platform/common/utils/normalize-email';
import { NormalizeRfc } from '@/platform/common/utils/normalize-rfc';

/**
 * Datos fiscales con los que se emitirá el CFDI.
 *
 * Las validaciones de aquí son **estructurales**: comprueban que el RFC tenga la forma de un
 * RFC y que las claves existan en los catálogos del SAT. No comprueban que el contribuyente
 * exista ni que el nombre coincida con el padrón — eso solo lo sabe el PAC, y por eso el
 * servicio valida contra Facturapi antes de dar el perfil por bueno.
 */
export class UpsertFiscalProfileDto {
  @IsString()
  @NormalizeRfc()
  @Matches(RFC_PATTERN, {
    message: 'El RFC no tiene un formato válido (12 caracteres para persona moral, 13 para física)',
  })
  rfc: string;

  /**
   * Razón social **exacta** de la Constancia de Situación Fiscal.
   *
   * Solo se recorta el espacio de los bordes. No se toca mayúsculas ni acentos: el SAT compara
   * contra su padrón y "normalizar" aquí es la vía rápida a un rechazo que el cliente no puede
   * explicarse, porque en pantalla el nombre se ve correcto.
   */
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(254)
  legalName: string;

  @IsString()
  @Matches(MEXICAN_ZIP_PATTERN, { message: 'El código postal debe tener 5 dígitos' })
  zipCode: string;

  @IsString()
  @IsIn(TAX_REGIME_CODES, { message: 'Régimen fiscal no reconocido' })
  taxRegime: string;

  @IsOptional()
  @IsString()
  @IsIn(CFDI_USE_CODES, { message: 'Uso del CFDI no reconocido' })
  cfdiUse?: string;

  @IsEmail({}, { message: 'El correo fiscal no es válido' })
  @NormalizeEmail()
  email: string;
}
