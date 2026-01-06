import { Expose, Type } from 'class-transformer';

/**
 * DTO para estadísticas por estado
 */
export class ExecutionStatusStatsDto {
  @Expose()
  completed: number;

  @Expose()
  failed: number;

  @Expose()
  cancelled: number;

  @Expose()
  timeout: number;

  @Expose()
  pending: number;

  @Expose()
  running: number;
}

/**
 * DTO para estadísticas de un workflow
 */
export class TopWorkflowStatsDto {
  @Expose()
  workflowId: string;

  @Expose()
  workflowName: string;

  @Expose()
  executions: number;

  @Expose()
  successRate: number;
}

/**
 * DTO para estadísticas de créditos por categoría
 */
export class CategoryCreditsStatsDto {
  @Expose()
  count: number;

  @Expose()
  credits: number;
}

/**
 * DTO para estadísticas de créditos
 */
export class CreditsStatsDto {
  @Expose()
  totalConsumed: number;

  @Expose()
  avgPerExecution: number;

  @Expose()
  executionsInOverage: number;

  @Expose()
  overageRate: number;

  @Expose()
  byCategory: Record<string, CategoryCreditsStatsDto>;
}

/**
 * DTO para respuesta de estadísticas de ejecuciones
 */
export class ExecutionStatsResponseDto {
  @Expose()
  period: string;

  @Expose()
  total: number;

  @Expose()
  successful: number;

  @Expose()
  failed: number;

  @Expose()
  cancelled: number;

  @Expose()
  timeout: number;

  @Expose()
  successRate: number;

  @Expose()
  avgDuration: number;

  @Expose()
  totalDuration: number;

  @Expose()
  @Type(() => ExecutionStatusStatsDto)
  byStatus: ExecutionStatusStatsDto;

  @Expose()
  byTrigger: Record<string, number>;

  @Expose()
  @Type(() => TopWorkflowStatsDto)
  topWorkflows: TopWorkflowStatsDto[];

  @Expose()
  @Type(() => CreditsStatsDto)
  credits: CreditsStatsDto;
}

/**
 * DTO para estadísticas por API Key
 */
export class ApiKeyStatsDto {
  @Expose()
  apiKeyId: string;

  @Expose()
  name: string;

  @Expose()
  keyPrefix: string;

  @Expose()
  total: number;

  @Expose()
  successful: number;

  @Expose()
  failed: number;

  @Expose()
  successRate: number;

  @Expose()
  avgDuration: number;
}

/**
 * DTO para estadísticas por usuario
 */
export class UserStatsDto {
  @Expose()
  userId: string;

  @Expose()
  name: string;

  @Expose()
  email: string;

  @Expose()
  total: number;

  @Expose()
  successful: number;

  @Expose()
  failed: number;

  @Expose()
  successRate: number;

  @Expose()
  avgDuration: number;
}

/**
 * DTO para respuesta de analytics por fuente
 */
export class ExecutionAnalyticsBySourceResponseDto {
  @Expose()
  workflowId: string;

  @Expose()
  workflowName: string;

  @Expose()
  period: string;

  @Expose()
  totalExecutions: number;

  @Expose()
  @Type(() => ApiKeyStatsDto)
  byApiKey: ApiKeyStatsDto[];

  @Expose()
  @Type(() => UserStatsDto)
  byUser: UserStatsDto[];
}
