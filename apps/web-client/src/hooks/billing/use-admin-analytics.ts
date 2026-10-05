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
    queryFn: () =>
      RootApi.getInstance().getAnalyticsAdminApi().getTopWorkflows(period, metric, limit),
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
      RootApi.getInstance()
        .getAnalyticsAdminApi()
        .getOrganizationsMargin(period, page, limit, sortBy),
    staleTime: 1000 * 60,
  });
}

/** Detalle de costo, tokens y margen de un workflow. `id` vacío no dispara la consulta. */
export function useAdminWorkflowAnalytics(id: string | null, period: string) {
  return useQuery({
    queryKey: [KEY, 'workflow', id, period],
    queryFn: () =>
      RootApi.getInstance()
        .getAnalyticsAdminApi()
        .getWorkflowAnalytics(id as string, period),
    enabled: Boolean(id),
    staleTime: 1000 * 60,
  });
}

/** Panorama de WhatsApp de toda la plataforma (tarjetas de la página de plantillas). */
export function useAdminWhatsappOverview() {
  return useQuery({
    queryKey: [KEY, 'whatsapp-overview'],
    queryFn: () => RootApi.getInstance().getAnalyticsAdminApi().getWhatsappOverview(),
    staleTime: 1000 * 60,
  });
}

/** Panorama del catálogo de modelos contra su uso real (tarjetas de la página de modelos). */
export function useAdminLlmModelsOverview() {
  return useQuery({
    queryKey: [KEY, 'llm-models-overview'],
    queryFn: () => RootApi.getInstance().getAnalyticsAdminApi().getLlmModelsOverview(),
    staleTime: 1000 * 60,
  });
}
