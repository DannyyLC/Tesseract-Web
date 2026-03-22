import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import RootApi from '@/app/_api_request_manager/_apis/root-api';
import WorkflowsStream from '@/app/_api_request_manager/_apis/workflows/workflows-stream';

// ============================================================================
// REST API HOOKS
// ============================================================================
// Hook para obtener el dashboard de workflows (Foto inicial)
import { WorkflowCategory } from '@tesseract/types';

// Hook para obtener el dashboard de workflows con filtros
export function useDashboardWorkflows(
  cursor?: string,
  pageSize: number = 10,
  action?: 'next' | 'prev',
  search?: string,
  isActive?: boolean,
  category?: WorkflowCategory,
) {
  return useQuery({
    queryKey: ['workflows', 'dashboard', cursor, pageSize, action, search, isActive, category],
    queryFn: async () => {
      const api = RootApi.getInstance().getWorkflowsApi();
      return await api.getDashboardWorkflows(cursor, pageSize, action, search, isActive, category);
    },
  });
}

// Hook para obtener el dashboard de workflows con scroll infinito
export function useInfiniteDashboardWorkflows(
  pageSize: number = 10,
  search?: string,
  isActive?: boolean,
  category?: WorkflowCategory,
) {
  return useInfiniteQuery({
    queryKey: ['workflows', 'dashboard', 'infinite', pageSize, search, isActive, category],
    queryFn: async ({ pageParam }) => {
      const api = RootApi.getInstance().getWorkflowsApi();
      // pageParam es el cursor de la siguiente página
      return await api.getDashboardWorkflows(
        pageParam as string | undefined,
        pageSize,
        'next',
        search,
        isActive,
        category,
      );
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      return lastPage.nextPageAvailable ? lastPage.nextCursor : undefined;
    },
  });
}

// Hook para obtener estadísticas globales
export function useWorkflowStats() {
  return useQuery({
    queryKey: ['workflows', 'stats'],
    queryFn: async () => {
      const api = RootApi.getInstance().getWorkflowsApi();
      return await api.getStats();
    },
  });
}

// Hook para obtener métricas de un workflow
export function useWorkflowMetrics(workflowId: string, period: string = '30d') {
  return useQuery({
    queryKey: ['workflows', 'metrics', workflowId, period],
    queryFn: async () => {
      const api = RootApi.getInstance().getWorkflowsApi();
      return await api.getMetrics(workflowId, period);
    },
    enabled: !!workflowId,
  });
}

// Hook para obtener detalle de un workflow
export function useWorkflow(id: string) {
  return useQuery({
    queryKey: ['workflows', 'detail', id],

    queryFn: async () => {
      const api = RootApi.getInstance().getWorkflowsApi();
      return await api.findOne(id);
    },
    enabled: !!id,
  });
}

// Hook para mutaciones (Update, Delete, Execute)
export function useWorkflowMutations() {
  const queryClient = useQueryClient();

  const updateWorkflow = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const api = RootApi.getInstance().getWorkflowsApi();
      return await api.update(id, data);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['workflows', 'detail', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['workflows', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['workflows', 'dashboard'] });
    },
  });

  const deleteWorkflow = useMutation({
    mutationFn: async (id: string) => {
      const api = RootApi.getInstance().getWorkflowsApi();
      return await api.remove(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['workflows', 'dashboard'] });
    },
  });

  const executeWorkflow = useMutation({
    mutationFn: async ({ id, input, metadata }: { id: string; input: any; metadata?: any }) => {
      const api = RootApi.getInstance().getWorkflowsApi();
      return await api.execute(id, input, metadata);
    },
  });

  return {
    updateWorkflow,
    deleteWorkflow,
    executeWorkflow,
  };
}

// ============================================================================
// EXECUTION STREAM HOOK
// ============================================================================
// Custom Hook para ejecutar un workflow y recibir stream (Chat style)
export function useExecuteStream() {
  const [messages, setMessages] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<any>(null);

  const execute = async (
    id: string,
    input: any,
    metadata?: any,
    onEvent?: (event: string, data: any) => void,
  ) => {
    setIsStreaming(true);
    setMessages('');
    setError(null);

    try {
      await WorkflowsStream.executeStream(id, input, metadata, {
        onChunk: (chunk) => {
          setMessages((prev) => prev + chunk);
        },
        onEvent: (event, data) => {
          if (onEvent) onEvent(event, data);
        },
        onError: (err) => {
          setError(err);
          setIsStreaming(false);
        },
        onComplete: () => {
          setIsStreaming(false);
        },
      });
    } catch (e) {
      setError(e);
      setIsStreaming(false);
    }
  };

  const clear = () => {
    setMessages('');
    setError(null);
    setIsStreaming(false);
  };

  return { execute, messages, isStreaming, error, clear };
}
