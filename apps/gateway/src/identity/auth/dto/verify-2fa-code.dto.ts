import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class Verify2FACodeDto {
  @ApiProperty({
    description:
      'Código de segundo factor: 6 dígitos de la app autenticadora o un código de respaldo (XXXXX-XXXXX)',
  })
  @IsString()
  @IsNotEmpty()
  code2FA: string;
}

/**
 * Para endpoints donde el código solo hace falta en algunos casos, como
 * `2fa/setup`, que lo exige únicamente si el usuario ya tiene el 2FA activo.
 */
export class Optional2FACodeDto {
  @ApiPropertyOptional({
    description: 'Código de segundo factor vigente; obligatorio solo si ya hay 2FA activo',
  })
  @IsString()
  @IsOptional()
  code2FA?: string;
}
