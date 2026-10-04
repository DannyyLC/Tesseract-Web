import { Expose, Type } from 'class-transformer';
import { SubscriptionPlan, WorkflowCategory } from '@tesseract/types';

/** Mínimo, promedio y percentiles de una métrica por ejecución. `null` si no hay ejecuciones cobradas. */
export class AdminAnalyticsDistributionDto {
  @Expose()
  avg: number | null;

  @Expose()
  p50: number | null;

  @Expose()
  p95: number | null;

  @Expose()
  max: number | null;
}

export class AdminAnalyticsWorkflowInfoDto {
  @Expose()
  id: string;

  @Expose()
  name: string;

  @Expose()
  category: WorkflowCategory;

  @Expose()
  organizationId: string;

  @Expose()
  organizationName: string;

  @Expose()
  plan: SubscriptionPlan;

  /** USD por crédito según el plan actual de la organización; `null` si no se puede resolver. */
  @Expose()
  creditValueUSD: number | null;
}

export class AdminAnalyticsWorkflowKpisDto {
  @Expose()
  executions: number;

  @Expose()
  completed: number;

  @Expose()
  failed: number;

  /** Ejecuciones con transacción de créditos: son las únicas con tokens y costo por ejecución. */
  @Expose()
  charged: number;

  @Expose()
  successRate: number;

  @Expose()
  creditsCharged: number;

  @Expose()
  costUSD: number;

  @Expose()
  estimatedRevenueUSD: number | null;

  @Expose()
  marginUSD: number | null;

  @Expose()
  marginPct: number | null;

  @Expose()
  @Type(() => AdminAnalyticsDistributionDto)
  costPerExecution: AdminAnalyticsDistributionDto;

  @Expose()
  @Type(() => AdminAnalyticsDistributionDto)
  inputTokens: AdminAnalyticsDistributionDto;

  @Expose()
  @Type(() => AdminAnalyticsDistributionDto)
  outputTokens: AdminAnalyticsDistributionDto;

  @Expose()
  totalInputTokens: number;

  @Expose()
  totalOutputTokens: number;

  /** Tokens de entrada por cada token de salida; `null` sin tokens de salida. */
  @Expose()
  inputOutputRatio: number | null;

  @Expose()
  @Type(() => AdminAnalyticsDistributionDto)
  durationMs: AdminAnalyticsDistributionDto;
}

export class AdminAnalyticsWorkflowModelRowDto {
  @Expose()
  model: string;

  @Expose()
  executions: number;

  @Expose()
  inputTokens: number;

  @Expose()
  outputTokens: number;

  @Expose()
  costUSD: number;

  @Expose()
  costSharePct: number;

  /** Ejecuciones sin `usage_by_model`: el motor costeó con el modelo por defecto y los tokens son los totales. */
  @Expose()
  estimated: boolean;
}

export class AdminAnalyticsWorkflowPointDto {
  @Expose()
  date: string;

  @Expose()
  executions: number;

  @Expose()
  costUSD: number;

  @Expose()
  estimatedRevenueUSD: number | null;

  @Expose()
  avgCostUSD: number | null;

  @Expose()
  avgInputTokens: number | null;

  @Expose()
  avgOutputTokens: number | null;
}

export class AdminAnalyticsCostBucketDto {
  @Expose()
  fromUSD: number;

  /** Límite superior del rango; `null` en el último, que acumula todo lo que queda por encima. */
  @Expose()
  toUSD: number | null;

  @Expose()
  count: number;
}

export class AdminAnalyticsTopExecutionDto {
  @Expose()
  id: string;

  @Expose()
  startedAt: string;

  @Expose()
  status: string;

  @Expose()
  costUSD: number;

  @Expose()
  inputTokens: number | null;

  @Expose()
  outputTokens: number | null;

  @Expose()
  durationMs: number | null;

  @Expose()
  conversationId: string | null;
}

export class AdminAnalyticsWorkflowResponseDto {
  @Expose()
  period: string;

  @Expose()
  timezone: string;

  @Expose()
  @Type(() => AdminAnalyticsWorkflowInfoDto)
  workflow: AdminAnalyticsWorkflowInfoDto;

  @Expose()
  @Type(() => AdminAnalyticsWorkflowKpisDto)
  kpis: AdminAnalyticsWorkflowKpisDto;

  @Expose()
  @Type(() => AdminAnalyticsWorkflowModelRowDto)
  byModel: AdminAnalyticsWorkflowModelRowDto[];

  @Expose()
  @Type(() => AdminAnalyticsWorkflowPointDto)
  timeseries: AdminAnalyticsWorkflowPointDto[];

  @Expose()
  @Type(() => AdminAnalyticsCostBucketDto)
  costDistribution: AdminAnalyticsCostBucketDto[];

  @Expose()
  @Type(() => AdminAnalyticsTopExecutionDto)
  topExecutions: AdminAnalyticsTopExecutionDto[];
}
