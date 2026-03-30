import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import RootApi from '@/app/_api_request_manager/_apis/root-api';
import { UpdateConversationDto } from '@tesseract/types';

interface DashboardParams {
  cursor?: string | null;
  pageSize?: number;
  action?: 'next' | 'prev' | null;
  status?: string;
  isIntervened?: boolean;
  workflowId?: string;
  userId?: string;
  prioritizeHitl?: boolean;
}

// Hook para obtener el dashboard de conversaciones
export function useConversationsDashboard(params: DashboardParams = {}) {
  return useQuery({
    queryKey: ['conversations', 'dashboard', params],
    queryFn: async () => {
      const api = RootApi.getInstance().getConversationsApi();
      return await api.getDashboardData(
        params.cursor,
        params.pageSize,
        params.action,
        params.status,
        params.isIntervened,
        params.workflowId,
        params.userId,
        params.prioritizeHitl,
      );
    },
  });
}

// Hook para obtener estadisticas de conversaciones
export function useConversationsStats() {
  return useQuery({
    queryKey: ['conversations', 'stats'],
    queryFn: async () => {
      const api = RootApi.getInstance().getConversationsApi();
      return await api.getStats();
    },
  });
}

// Hook para traer los detalles de una conversación especifica
export function useConversation(conversationId: string) {
  return useQuery({
    queryKey: ['conversations', 'detail', conversationId],
    queryFn: async () => {
      const api = RootApi.getInstance().getConversationsApi();
      return await api.getById(conversationId);
    },
    enabled: !!conversationId,
  });
}

// Hook para mutaciones (Update, Delete)
export function useConversationMutations() {
  const queryClient = useQueryClient();

  const updateConversation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateConversationDto }) => {
      const api = RootApi.getInstance().getConversationsApi();
      return await api.update(id, data);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['conversations', 'detail', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['conversations', 'dashboard'] });
    },
  });

  const deleteConversation = useMutation({
    mutationFn: async (id: string) => {
      const api = RootApi.getInstance().getConversationsApi();
      return await api.remove(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations', 'dashboard'] });
    },
  });

  return {
    updateConversation,
    deleteConversation,
  };
}
