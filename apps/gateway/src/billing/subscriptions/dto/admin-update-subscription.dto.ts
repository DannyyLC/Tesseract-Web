import { IsBoolean, IsDateString, IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionPlan, SubscriptionStatus } from '@tesseract/database';

/**
 * Edición manual de la suscripción por un super admin, para organizaciones que facturan por
 * transferencia (sin `stripeSubscriptionId`). `BillingService.adminSetManualSubscription`
 * rechaza esta operación si la organización sí tiene una suscripción real en Stripe.
 */
export class AdminUpdateSubscriptionDto {
  @ApiPropertyOptional({ description: 'Plan a asignar. Omitido = no cambia el plan actual.' })
  @IsOptional()
  @IsEnum(SubscriptionPlan)
  plan?: SubscriptionPlan;

  @ApiPropertyOptional({ description: 'Estado a asignar. Omitido = no cambia el estado actual.' })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @ApiPropertyOptional({
    description: 'Fin del período de facturación actual (ISO 8601). Omitido = no cambia.',
  })
  @IsOptional()
  @IsDateString()
  currentPeriodEnd?: string;

  @ApiPropertyOptional({
    description: 'Si true, la suscripción no se renueva al final del período.',
  })
  @IsOptional()
  @IsBoolean()
  cancelAtPeriodEnd?: boolean;
}
