import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import RootApi from '@/app/_api_request_manager/_apis/root-api';
import { CreateTenantToolDto, DashboardTenantToolDto, UpdateTenantToolDto } from '@tesseract/types';

// ─── Dashboard (scroll infinito) ─────────────────────────────────────────────
interface DashboardParams {
  pageSize?: number;
}

export function useInfiniteTenantToolsDashboard(params: DashboardParams = {}) {
  const { pageSize = 10 } = params;

  return useInfiniteQuery({
    queryKey: ['tenant-tools', 'dashboard', 'infinite', { pageSize }],
    queryFn: async ({ pageParam }) => {
      const api = RootApi.getInstance().getTenantToolsApi();
      return await api.getDashboardData({
        cursor: (pageParam as string | undefined) ?? null,
        action: pageParam ? 'next' : null,
        pageSize,
      });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.nextPageAvailable ? (lastPage.nextCursor ?? undefined) : undefined,
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutos
  });
}

// ─── Detalle de un tenant tool ────────────────────────────────────────────────
export function useTenantTool(id: string) {
  return useQuery({
    queryKey: ['tenant-tools', 'detail', id],
    queryFn: async () => {
      const api = RootApi.getInstance().getTenantToolsApi();
      return await api.getById(id);
    },
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
  });
}

// ─── Mutaciones ───────────────────────────────────────────────────────────────
export function useTenantToolMutations() {
  const queryClient = useQueryClient();

  const invalidateDashboard = () =>
    queryClient.invalidateQueries({ queryKey: ['tenant-tools', 'dashboard'] });

  const createTenantTool = useMutation({
    mutationFn: async (data: CreateTenantToolDto) => {
      const api = RootApi.getInstance().getTenantToolsApi();
      return await api.create(data);
    },
    onSuccess: () => {
      invalidateDashboard();
    },
  });

  const updateTenantTool = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateTenantToolDto }) => {
      const api = RootApi.getInstance().getTenantToolsApi();
      return await api.update(id, data);
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tenant-tools', 'detail', variables.id] });
      invalidateDashboard();
    },
  });

  const addWorkflows = useMutation({
    mutationFn: async ({ id, workflowIds }: { id: string; workflowIds: string[] }) => {
      const api = RootApi.getInstance().getTenantToolsApi();
      return await api.addWorkflows(id, workflowIds);
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tenant-tools', 'detail', variables.id] });
    },
  });

  const removeWorkflows = useMutation({
    mutationFn: async ({ id, workflowIds }: { id: string; workflowIds: string[] }) => {
      const api = RootApi.getInstance().getTenantToolsApi();
      return await api.removeWorkflows(id, workflowIds);
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tenant-tools', 'detail', variables.id] });
    },
  });

  const disconnectTool = useMutation({
    mutationFn: async (toolId: string) => {
      const api = RootApi.getInstance().getTenantToolsApi();
      return await api.disconnect(toolId);
    },
    onSuccess: () => {
      invalidateDashboard();
    },
  });

  const deleteTool = useMutation({
    mutationFn: async (toolId: string) => {
      const api = RootApi.getInstance().getTenantToolsApi();
      return await api.deleteTool(toolId);
    },
    onSuccess: () => {
      invalidateDashboard();
    },
  });

  return {
    createTenantTool,
    updateTenantTool,
    addWorkflows,
    removeWorkflows,
    disconnectTool,
    deleteTool,
  };
}

/**
 * Helper para aplanar las páginas en un array plano de tenant tools.
 */
export function flattenTenantTools(
  data: ReturnType<typeof useInfiniteTenantToolsDashboard>['data'],
): DashboardTenantToolDto[] {
  return data?.pages.flatMap((page) => page.items) ?? [];
}
