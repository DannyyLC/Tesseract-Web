import { IsInt, IsNotEmpty, IsString, MinLength, NotEquals } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Ajuste manual de créditos por un super admin. Se registra como
 * `TransactionType.MANUAL_ADJUSTMENT` en `CreditTransaction`, así que `reason` es obligatorio:
 * es el único rastro de por qué se tocó el balance de la organización.
 */
export class AdminAdjustCreditsDto {
  @ApiProperty({
    description: 'Créditos a sumar (positivo) o restar (negativo). No puede ser cero.',
  })
  @IsInt()
  @NotEquals(0)
  amount: number;

  @ApiProperty({ description: 'Motivo del ajuste, queda registrado en la transacción.' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  reason: string;
}
