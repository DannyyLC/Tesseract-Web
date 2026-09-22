import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import RootApi from '@/lib/api/endpoints/root-api';
import WorkflowsStream from '@/lib/api/endpoints/automation/workflows/workflows-stream';

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
export function useWorkflowMetrics(
  workflowId: string,
  period: string = '30d',
  tzSource: 'organization' | 'workflow' = 'organization',
) {
  return useQuery({
    queryKey: ['workflows', 'metrics', workflowId, period, tzSource],
    queryFn: async () => {
      const api = RootApi.getInstance().getWorkflowsApi();
      return await api.getMetrics(workflowId, period, tzSource);
    },
    enabled: !!workflowId,
  });
}

// Hook para la distribución horaria de un workflow (24 franjas)
export function useWorkflowHourlyDistribution(
  workflowId: string,
  period: string = '30d',
  tzSource: 'organization' | 'workflow' = 'organization',
) {
  return useQuery({
    queryKey: ['workflows', 'hourly-distribution', workflowId, period, tzSource],
    queryFn: async () => {
      const api = RootApi.getInstance().getWorkflowsApi();
      return await api.getHourlyDistribution(workflowId, period, tzSource);
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
      // Editar el workflow puede cambiar su zona horaria, y las series ya cargadas
      // quedarían calculadas con la anterior sin ninguna señal de estar obsoletas.
      queryClient.invalidateQueries({ queryKey: ['workflows', 'metrics', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['workflows', 'hourly-distribution', variables.id] });
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
  const queryClient = useQueryClient();

  const execute = async (
    id: string,
    input: any,
    metadata?: any,
    onEvent?: (event: string, data: any) => void,
    conversationId?: string,
  ) => {
    setIsStreaming(true);
    setMessages('');
    setError(null);

    // Solo sincronizamos el detalle con el servidor cuando el stream falla o se trunca.
    // En el caso normal el estado local ya tiene todo lo que el servidor guardaría, y
    // refetchear el detalle con la conversación abierta cambia los ids temporales de los
    // mensajes recién creados por los reales: como la lista se renderiza con `key={msg.id}`
    // sobre un `motion.div`, React remonta esos nodos y framer-motion vuelve a animarlos
    // de entrada. El detalle ya se revalida al montar (ver `useConversation`).
    const syncOnFailure = (resolvedId?: string) => {
      const idToSync = resolvedId ?? conversationId;
      if (idToSync) {
        queryClient.invalidateQueries({ queryKey: ['conversations', 'detail', idToSync] });
      }
    };

    // El listado sí hay que refrescarlo pase lo que pase: el preview del último mensaje y
    // el orden por actividad quedan viejos en cuanto termina el stream. Invalidar solo el
    // dashboard no toca la conversación abierta, así que no provoca la re-animación.
    const syncDashboard = () => {
      queryClient.invalidateQueries({ queryKey: ['conversations', 'dashboard'] });
    };

    // Capturar el conversationId que llega por el evento SSE (para conversaciones nuevas)
    let resolvedConversationId = conversationId;

    try {
      await WorkflowsStream.executeStream(id, input, metadata, {
        onChunk: (chunk) => {
          setMessages((prev) => prev + chunk);
        },
        onEvent: (event, data) => {
          if (onEvent) onEvent(event, data);
          if (event === 'conversation_id') {
            resolvedConversationId = data;
          }
        },
        onError: (err) => {
          setError(err);
          setIsStreaming(false);
          // Stream fallido o truncado: ir al servidor para mostrar la respuesta guardada en DB
          syncOnFailure(resolvedConversationId);
          syncDashboard();
        },
        onComplete: () => {
          setIsStreaming(false);
          // Stream exitoso: el estado local ya tiene los tokens, el detalle no se refetchea
          syncDashboard();
        },
      });
    } catch (e) {
      setError(e);
      setIsStreaming(false);
      syncOnFailure(resolvedConversationId);
      syncDashboard();
    }
  };

  const clear = () => {
    setMessages('');
    setError(null);
    setIsStreaming(false);
  };

  return { execute, messages, isStreaming, error, clear };
}
