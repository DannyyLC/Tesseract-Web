import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import RootApi from '@/lib/api/endpoints/root-api';
import { UpdateConversationDto } from '@tesseract/types';

interface DashboardParams {
  cursor?: string | null;
  pageSize?: number;
  action?: 'next' | 'prev' | null;
  status?: string;
  isIntervened?: boolean;
  needsFollowUp?: boolean;
  workflowId?: string;
  userId?: string;
  prioritizeHitl?: boolean;
  /** Valores del enum de canal. Vacío o ausente = todos. */
  channels?: readonly string[];
}

// Hook para obtener el dashboard de conversaciones
export function useConversationsDashboard(params: DashboardParams = {}) {
  return useQuery({
    queryKey: ['conversations', 'dashboard', params],
    queryFn: async () => {
      const api = RootApi.getInstance().getConversationsApi();
      return await api.getDashboardData(params);
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

/**
 * Detalle de una conversación. Revalida siempre al montar, a propósito.
 *
 * El `staleTime` global de 5 minutos sirve para catálogos, no para esto: los mensajes de
 * la página viven en un `useState` que se pierde al desmontar, así que al volver a entrar
 * la lista se reconstruye desde esta query. Sirviendo caché, la conversación reaparecía
 * sin los últimos mensajes hasta recargar la página (F5 crea un QueryClient nuevo).
 * Además el historial cambia por fuera de esta pestaña —WhatsApp entrante, otro agente en
 * HITL—, así que la caché nunca es autoridad.
 */
export function useConversation(conversationId: string) {
  return useQuery({
    queryKey: ['conversations', 'detail', conversationId],
    queryFn: async () => {
      const api = RootApi.getInstance().getConversationsApi();
      return await api.getById(conversationId);
    },
    enabled: !!conversationId,
    staleTime: 0,
    refetchOnMount: 'always',
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
