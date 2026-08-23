import { Expose, Type } from 'class-transformer';
import { WorkflowCategory } from '@tesseract/types';

/**
 * KPIs agregados de plataforma para el rango pedido.
 *
 * `activeOrganizations` cuenta solo organizaciones con al menos una ejecución en el rango,
 * no el total de organizaciones de la plataforma — no confundir una cosa con la otra en la UI.
 */
export class AdminAnalyticsKpisDto {
  @Expose()
  activeOrganizations: number;

  @Expose()
  totalExecutions: number;

  @Expose()
  totalCostUSD: number;

  @Expose()
  totalCreditsCharged: number;

  /** Suma de `creditsCharged * valorDelCreditoUSD`, solo de organizaciones con precio resoluble. */
  @Expose()
  estimatedRevenueUSD: number;

  @Expose()
  marginUSD: number;

  /** `null` si `estimatedRevenueUSD` es 0 (nada que dividir). */
  @Expose()
  marginPct: number | null;

  @Expose()
  overageExecutions: number;

  @Expose()
  overageRate: number;

  /** Organizaciones excluidas de `estimatedRevenueUSD`/`marginUSD` por no tener un precio resoluble. */
  @Expose()
  unpricedOrganizations: number;
}

/** Comparación costo real vs. valor cobrado para una categoría de workflow. Siempre las 3 filas, aunque una tenga 0 ejecuciones. */
export class AdminAnalyticsCategoryRowDto {
  @Expose()
  category: WorkflowCategory;

  @Expose()
  executions: number;

  @Expose()
  costUSD: number;

  @Expose()
  creditsCharged: number;

  @Expose()
  estimatedRevenueUSD: number;

  @Expose()
  marginUSD: number;

  @Expose()
  marginPct: number | null;
}

export class AdminAnalyticsOverviewResponseDto {
  @Expose()
  period: string;

  /**
   * Zona fija de la plataforma ('America/Mexico_City'), no de una organización: el dashboard
   * agrega ejecuciones de todas a la vez, y el equipo que lo consulta opera desde México. No
   * confundir con `ExecutionsService.getStats()`, que sí agrupa en la zona de una organización.
   */
  @Expose()
  timezone: string;

  @Expose()
  @Type(() => AdminAnalyticsKpisDto)
  kpis: AdminAnalyticsKpisDto;

  @Expose()
  @Type(() => AdminAnalyticsCategoryRowDto)
  byCategory: AdminAnalyticsCategoryRowDto[];
}
