import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { CREDIT_TOPUP_LIMITS } from '@tesseract/types';

/**
 * Cuerpo de `POST /billing/credits/checkout`.
 *
 * `Min`/`Max` son la primera barrera contra un dedazo ("se me fue un cero de más"), pero no la
 * única: `BillingService.createCreditTopUpCheckoutSession` además exige múltiplos de
 * `CREDIT_TOPUP_LIMITS.step`, algo que `class-validator` no expresa con un decorador simple.
 */
export class CreateCreditCheckoutDto {
  @ApiProperty({
    description: `Créditos a comprar. Entre ${CREDIT_TOPUP_LIMITS.min} y ${CREDIT_TOPUP_LIMITS.max}, en múltiplos de ${CREDIT_TOPUP_LIMITS.step}.`,
    example: 1000,
  })
  @IsInt()
  @Min(CREDIT_TOPUP_LIMITS.min)
  @Max(CREDIT_TOPUP_LIMITS.max)
  credits: number;

  @ApiPropertyOptional({
    description: 'Código de segundo factor vigente; obligatorio solo si el usuario ya tiene 2FA activo.',
  })
  @IsString()
  @IsOptional()
  code2FA?: string;
}
