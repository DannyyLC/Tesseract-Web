export interface DashboardExecutionDataDto {
  id: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  duration: number | null;
  trigger: string;
  credits: number | null;
  workflowId: string;
  workflow?: { name: string };
  workflowName?: string | null;
  userId: string | null;
  user?: { name: string };
  userName?: string | null;
}

export interface ExecutionsStatsDto {
  period: string;
  total: number;
  successful: number;
  failed: number;
  cancelled: number;
  timeout: number;
  successRate: number;
  avgDuration: number;
  totalDuration: number;
  byStatus: Record<string, number>;
  byTrigger: Record<string, number>;
  topWorkflows: {
    workflowId: string;
    workflowName: string;
    executions: number;
    successRate: number;
  }[];
  credits: {
    totalConsumed: number;
    avgPerExecution: number;
    executionsInOverage: number;
    overageRate: number;
    byCategory: Record<string, { count: number; credits: number }>;
  };
  dailyStats?: {
    date: string;
    count: number;
  }[];
  /** Zona IANA con la que se agruparon `dailyStats`. */
  timezone?: string;
}

/**
 * Distribución de ejecuciones por hora del día, para responder "¿a qué hora recibo
 * actividad?".
 *
 * `buckets` trae siempre las 24 franjas, con `count: 0` donde no hubo nada: si se
 * omitieran, la gráfica dibujaría huecos y las horas muertas —que son justo el dato
 * interesante— desaparecerían del eje.
 */
export interface HourlyDistributionDto {
  period: string;
  /** Zona IANA en la que se calcularon las horas. El front la muestra junto al eje. */
  timezone: string;
  /** Total de ejecuciones del periodo, para distinguir "sin datos" de "todo en ceros". */
  total: number;
  buckets: {
    /** 0-23 en la zona indicada. */
    hour: number;
    count: number;
  }[];
}

export interface ExecutionDto {
  id: string;
  startedAt: Date;
  finishedAt: Date | null;
  duration: number | null;
  trigger: string;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
  credits: number | null;
  balanceBefore: number | null;
  balanceAfter: number | null;
  wasOverage: boolean | null;
  workflowId: string;
  organizationId: string;
  conversationId: string | null;
  userId: string | null;
  apiKeyName?: string;
}
