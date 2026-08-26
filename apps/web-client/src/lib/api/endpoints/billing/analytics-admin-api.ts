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
    return result.data.data!;
  }

  public async getTimeseries(period: string): Promise<AdminAnalyticsTimeseries> {
    const result = await this.apiRequestManager.get<ApiResponse<AdminAnalyticsTimeseries>>(
      `${AnalyticsAdminApi.BASE_URL}/timeseries?period=${period}`,
    );
    return result.data.data!;
  }

  public async getTopWorkflows(
    period: string,
    metric: 'cost' | 'executions' = 'cost',
    limit = 10,
  ): Promise<AdminAnalyticsTopWorkflows> {
    const result = await this.apiRequestManager.get<ApiResponse<AdminAnalyticsTopWorkflows>>(
      `${AnalyticsAdminApi.BASE_URL}/top-workflows?period=${period}&metric=${metric}&limit=${limit}`,
    );
    return result.data.data!;
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
    return result.data.data!;
  }
}

export default AnalyticsAdminApi;
