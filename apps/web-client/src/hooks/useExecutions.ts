import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import RootApi from '@/app/_api_request_manager/_apis/root-api';

interface DashboardExecutionsParams {
  cursor?: string | null;
  pageSize?: number;
  action?: 'next' | 'prev' | null;
  workflowId?: string;
  userId?: string;
  startDate?: Date;
  endDate?: Date;
  status?: string;
  trigger?: string;
}

// Hook para obtener el dashboard de ejecuciones
export function useDashboardExecutions(params: DashboardExecutionsParams = {}) {
  return useQuery({
    queryKey: ['executions', 'dashboard', params],
    queryFn: async () => {
      const api = RootApi.getInstance().getExecutionsApi();
      return await api.getDashboardData(params);
    },
  });
}

// Hook para obtener estadísticas de ejecuciones
export function useExecutionsStats(period: '24h' | '7d' | '30d' | '90d' | 'all' = '30d') {
  return useQuery({
    queryKey: ['executions', 'stats', period],
    queryFn: async () => {
      const api = RootApi.getInstance().getExecutionsApi();
      return await api.getStats(period);
    },
  });
}

// Hook para obtener detalle de una ejecución
export function useExecution(id: string) {
  return useQuery({
    queryKey: ['executions', 'detail', id],
    queryFn: async () => {
      const api = RootApi.getInstance().getExecutionsApi();
      return await api.getById(id);
    },
    enabled: !!id,
  });
}

// Hook para mutaciones (Cancel, Delete)
export function useExecutionMutations() {
  const queryClient = useQueryClient();

  const cancelExecution = useMutation({
    mutationFn: async (id: string) => {
      const api = RootApi.getInstance().getExecutionsApi();
      return await api.cancel(id);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['executions', 'detail', variables] });
      queryClient.invalidateQueries({ queryKey: ['executions', 'dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['executions', 'stats'] });
    },
  });

  const deleteExecution = useMutation({
    mutationFn: async (id: string) => {
      const api = RootApi.getInstance().getExecutionsApi();
      return await api.remove(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['executions', 'dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['executions', 'stats'] });
    },
  });

  return {
    cancelExecution,
    deleteExecution,
  };
}
