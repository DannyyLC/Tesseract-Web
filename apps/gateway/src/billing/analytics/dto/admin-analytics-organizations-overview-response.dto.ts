import { Expose, Type } from 'class-transformer';

export class AdminOrganizationsCountsDto {
  @Expose()
  active: number;

  @Expose()
  inactive: number;

  @Expose()
  paying: number;

  @Expose()
  free: number;
}

/**
 * Ingreso mensual recurrente por moneda, en unidades (no centavos). No se convierte entre
 * monedas: una tasa de cambio inventada aquí sería un número que nadie podría auditar.
 */
export class AdminOrganizationsMrrDto {
  @Expose()
  mxn: number;

  @Expose()
  usd: number;

  /** Organizaciones que pagan y cuyo importe sí se pudo resolver. */
  @Expose()
  priced: number;

  /** Pagan (plan distinto de FREE) pero sin suscripción vigente o sin precio resoluble. */
  @Expose()
  unpriced: number;

  /** De las `priced`, cuántas se cobran fuera de Stripe (facturación manual). */
  @Expose()
  manual: number;
}

export class AdminOrganizationsAttentionDto {
  @Expose()
  total: number;

  @Expose()
  negativeBalance: number;

  @Expose()
  lowCredits: number;

  @Expose()
  paymentIssue: number;

  @Expose()
  manualRenewalDue: number;
}

export class AdminOrganizationsIdleDto {
  @Expose()
  total: number;

  @Expose()
  days: number;
}

export class AdminOrganizationsOverviewResponseDto {
  @Expose()
  @Type(() => AdminOrganizationsCountsDto)
  organizations: AdminOrganizationsCountsDto;

  @Expose()
  @Type(() => AdminOrganizationsMrrDto)
  mrr: AdminOrganizationsMrrDto;

  @Expose()
  @Type(() => AdminOrganizationsAttentionDto)
  attention: AdminOrganizationsAttentionDto;

  @Expose()
  @Type(() => AdminOrganizationsIdleDto)
  idle: AdminOrganizationsIdleDto;
}
