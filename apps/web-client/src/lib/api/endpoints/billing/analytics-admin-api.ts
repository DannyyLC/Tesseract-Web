import { unwrapData } from '@/lib/api/unwrap-data';
import ApiRequestManager from '../../api-request-manager';
import type { ApiResponse } from '@tesseract/types';

export type WorkflowCategory = 'LIGHT' | 'STANDARD' | 'ADVANCED';

export interface AdminAnalyticsKpis {
  activeOrganizations: number;
  totalExecutions: number;
  totalCostUSD: number;
  totalCreditsCharged: number;
  estimatedRevenueUSD: number;
  marginUSD: number;
  marginPct: number | null;
  overageExecutions: number;
  overageRate: number;
  unpricedOrganizations: number;
}

export interface AdminAnalyticsCategoryRow {
  category: WorkflowCategory;
  executions: number;
  costUSD: number;
  creditsCharged: number;
  estimatedRevenueUSD: number;
  marginUSD: number;
  marginPct: number | null;
}

export interface AdminAnalyticsOverview {
  period: string;
  timezone: string;
  kpis: AdminAnalyticsKpis;
  byCategory: AdminAnalyticsCategoryRow[];
}

export interface AdminAnalyticsTimeseriesPoint {
  date: string;
  executions: number;
  costUSD: number;
  creditsCharged: number;
}

export interface AdminAnalyticsTimeseries {
  period: string;
  timezone: string;
  points: AdminAnalyticsTimeseriesPoint[];
}

export interface AdminAnalyticsTopWorkflow {
  workflowId: string;
  workflowName: string;
  organizationId: string;
  organizationName: string;
  category: WorkflowCategory;
  executions: number;
  costUSD: number;
  creditsCharged: number;
}

export interface AdminAnalyticsTopWorkflows {
  metric: 'cost' | 'executions';
  items: AdminAnalyticsTopWorkflow[];
}

export interface AdminAnalyticsOrgMarginRow {
  organizationId: string;
  organizationName: string;
  plan: string;
  executions: number;
  costUSD: number;
  creditsCharged: number;
  estimatedRevenueUSD: number | null;
  marginUSD: number | null;
  marginPct: number | null;
}

export interface AdminAnalyticsOrganizationsMargin {
  items: AdminAnalyticsOrgMarginRow[];
  page: number;
  limit: number;
  total: number;
}

export interface AdminAnalyticsDistribution {
  avg: number | null;
  p50: number | null;
  p95: number | null;
  max: number | null;
}

export interface AdminWorkflowAnalyticsKpis {
  executions: number;
  completed: number;
  failed: number;
  /** Ejecuciones cobradas: las únicas con tokens y costo por ejecución. */
  charged: number;
  successRate: number;
  creditsCharged: number;
  costUSD: number;
  estimatedRevenueUSD: number | null;
  marginUSD: number | null;
  marginPct: number | null;
  costPerExecution: AdminAnalyticsDistribution;
  inputTokens: AdminAnalyticsDistribution;
  outputTokens: AdminAnalyticsDistribution;
  totalInputTokens: number;
  totalOutputTokens: number;
  inputOutputRatio: number | null;
  durationMs: AdminAnalyticsDistribution;
}

export interface AdminWorkflowAnalyticsModelRow {
  model: string;
  executions: number;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
  costSharePct: number;
  estimated: boolean;
}

export interface AdminWorkflowAnalyticsPoint {
  date: string;
  executions: number;
  costUSD: number;
  estimatedRevenueUSD: number | null;
  avgCostUSD: number | null;
  avgInputTokens: number | null;
  avgOutputTokens: number | null;
}

export interface AdminWorkflowAnalyticsCostBucket {
  fromUSD: number;
  /** `null` en el último rango, que acumula todo lo que queda por encima del p99. */
  toUSD: number | null;
  count: number;
}

export interface AdminWorkflowAnalyticsTopExecution {
  id: string;
  startedAt: string;
  status: string;
  costUSD: number;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number | null;
  conversationId: string | null;
}

export interface AdminWorkflowAnalytics {
  period: string;
  timezone: string;
  workflow: {
    id: string;
    name: string;
    category: WorkflowCategory;
    organizationId: string;
    organizationName: string;
    plan: string;
    creditValueUSD: number | null;
  };
  kpis: AdminWorkflowAnalyticsKpis;
  byModel: AdminWorkflowAnalyticsModelRow[];
  timeseries: AdminWorkflowAnalyticsPoint[];
  costDistribution: AdminWorkflowAnalyticsCostBucket[];
  topExecutions: AdminWorkflowAnalyticsTopExecution[];
}

export interface AdminOrganizationsOverview {
  organizations: { active: number; inactive: number; paying: number; free: number };
  /** Ingreso mensual recurrente por moneda, en unidades; no se convierte entre monedas. */
  mrr: { mxn: number; usd: number; priced: number; unpriced: number; manual: number };
  attention: {
    total: number;
    negativeBalance: number;
    lowCredits: number;
    paymentIssue: number;
    manualRenewalDue: number;
  };
  idle: { total: number; days: number };
}

export interface AdminWorkflowsOverview {
  workflows: { active: number; paused: number; inactive: number; internal: number };
  failing: {
    total: number;
    failedExecutions: number;
    days: number;
    minExecutions: number;
    thresholdPct: number;
  };
  negativeMargin: { total: number; lossUSD: number; days: number };
  idle: { total: number; days: number };
}

class AnalyticsAdminApi {
  public apiRequestManager: ApiRequestManager;
  private static BASE_URL = '/admin/analytics';

  constructor() {
    this.apiRequestManager = ApiRequestManager.getInstance();
  }

  public async getOverview(period: string): Promise<AdminAnalyticsOverview> {
    const result = await this.apiRequestManager.get<ApiResponse<AdminAnalyticsOverview>>(
      `${AnalyticsAdminApi.BASE_URL}/overview?period=${period}`,
    );
    return unwrapData(result);
  }

  public async getTimeseries(period: string): Promise<AdminAnalyticsTimeseries> {
    const result = await this.apiRequestManager.get<ApiResponse<AdminAnalyticsTimeseries>>(
      `${AnalyticsAdminApi.BASE_URL}/timeseries?period=${period}`,
    );
    return unwrapData(result);
  }

  public async getTopWorkflows(
    period: string,
    metric: 'cost' | 'executions' = 'cost',
    limit = 10,
  ): Promise<AdminAnalyticsTopWorkflows> {
    const result = await this.apiRequestManager.get<ApiResponse<AdminAnalyticsTopWorkflows>>(
      `${AnalyticsAdminApi.BASE_URL}/top-workflows?period=${period}&metric=${metric}&limit=${limit}`,
    );
    return unwrapData(result);
  }

  public async getOrganizationsMargin(
    period: string,
    page = 1,
    limit = 20,
    sortBy: 'marginPct' | 'costUSD' | 'executions' = 'marginPct',
  ): Promise<AdminAnalyticsOrganizationsMargin> {
    const result = await this.apiRequestManager.get<ApiResponse<AdminAnalyticsOrganizationsMargin>>(
      `${AnalyticsAdminApi.BASE_URL}/organizations-margin?period=${period}&page=${page}&limit=${limit}&sortBy=${sortBy}`,
    );
    return unwrapData(result);
  }
  public async getOrganizationsOverview(): Promise<AdminOrganizationsOverview> {
    const result = await this.apiRequestManager.get<ApiResponse<AdminOrganizationsOverview>>(
      `${AnalyticsAdminApi.BASE_URL}/organizations-overview`,
    );
    return unwrapData(result);
  }

  public async getWorkflowsOverview(): Promise<AdminWorkflowsOverview> {
    const result = await this.apiRequestManager.get<ApiResponse<AdminWorkflowsOverview>>(
      `${AnalyticsAdminApi.BASE_URL}/workflows-overview`,
    );
    return unwrapData(result);
  }

  public async getWorkflowAnalytics(id: string, period: string): Promise<AdminWorkflowAnalytics> {
    const result = await this.apiRequestManager.get<ApiResponse<AdminWorkflowAnalytics>>(
      `${AnalyticsAdminApi.BASE_URL}/workflows/${id}?period=${period}`,
    );
    return unwrapData(result);
  }
}

export default AnalyticsAdminApi;
