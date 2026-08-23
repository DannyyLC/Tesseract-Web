import { useQuery } from '@tanstack/react-query';
import RootApi from '@/lib/api/endpoints/root-api';

const KEY = 'admin-analytics';

export function useAdminAnalyticsOverview(period: string) {
  return useQuery({
    queryKey: [KEY, 'overview', period],
    queryFn: () => RootApi.getInstance().getAnalyticsAdminApi().getOverview(period),
    staleTime: 1000 * 60,
  });
}

export function useAdminAnalyticsTimeseries(period: string) {
  return useQuery({
    queryKey: [KEY, 'timeseries', period],
    queryFn: () => RootApi.getInstance().getAnalyticsAdminApi().getTimeseries(period),
    staleTime: 1000 * 60,
  });
}

export function useAdminAnalyticsTopWorkflows(
  period: string,
  metric: 'cost' | 'executions' = 'cost',
  limit = 10,
) {
  return useQuery({
    queryKey: [KEY, 'top-workflows', period, metric, limit],
    queryFn: () => RootApi.getInstance().getAnalyticsAdminApi().getTopWorkflows(period, metric, limit),
    staleTime: 1000 * 60,
  });
}

export function useAdminAnalyticsOrganizationsMargin(
  period: string,
  page = 1,
  limit = 20,
  sortBy: 'marginPct' | 'costUSD' | 'executions' = 'marginPct',
) {
  return useQuery({
    queryKey: [KEY, 'organizations-margin', period, page, limit, sortBy],
    queryFn: () =>
      RootApi.getInstance().getAnalyticsAdminApi().getOrganizationsMargin(period, page, limit, sortBy),
    staleTime: 1000 * 60,
  });
}
