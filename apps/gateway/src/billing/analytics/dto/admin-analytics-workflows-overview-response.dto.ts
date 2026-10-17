import { Expose, Type } from 'class-transformer';

export class AdminWorkflowsCountsDto {
  /** Activos y no pausados: los que hoy pueden responder. */
  @Expose()
  active: number;

  @Expose()
  paused: number;

  @Expose()
  inactive: number;

  @Expose()
  internal: number;
}

export class AdminWorkflowsFailingDto {
  @Expose()
  total: number;

  /** Ejecuciones fallidas (FAILED o TIMEOUT) de esos workflows en la ventana. */
  @Expose()
  failedExecutions: number;

  @Expose()
  days: number;

  @Expose()
  minExecutions: number;

  @Expose()
  thresholdPct: number;
}

export class AdminWorkflowsNegativeMarginDto {
  @Expose()
  total: number;

  /** Cuánto se pierde en la ventana sumando esos workflows (costo − cobrado), en USD. */
  @Expose()
  lossUSD: number;

  @Expose()
  days: number;
}

export class AdminWorkflowsIdleDto {
  @Expose()
  total: number;

  @Expose()
  days: number;
}

export class AdminWorkflowsOverviewResponseDto {
  @Expose()
  @Type(() => AdminWorkflowsCountsDto)
  workflows: AdminWorkflowsCountsDto;

  @Expose()
  @Type(() => AdminWorkflowsFailingDto)
  failing: AdminWorkflowsFailingDto;

  @Expose()
  @Type(() => AdminWorkflowsNegativeMarginDto)
  negativeMargin: AdminWorkflowsNegativeMarginDto;

  @Expose()
  @Type(() => AdminWorkflowsIdleDto)
  idle: AdminWorkflowsIdleDto;
}
