import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import RootApi from '@/lib/api/endpoints/root-api';

const KEY = 'admin-conversations';
const api = () => RootApi.getInstance().getConversationsAdminApi();

/**
 * Historial de conversaciones de un workflow, paginado por cursor — fuente del menú con
 * scroll infinito en la pestaña Probar. Solo se pide mientras el menú está abierto
 * (`enabled`): no tiene sentido mantenerlo vivo en segundo plano.
 */
export function useInfiniteAdminConversations(
  params: { organizationId: string; workflowId: string; onlyErrors: boolean },
  enabled: boolean,
) {
  return useInfiniteQuery({
    queryKey: [KEY, 'list', params],
    queryFn: async ({ pageParam }: { pageParam?: string }) =>
      api().findAll({ ...params, cursor: pageParam, take: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.nextPageAvailable ? (last.nextCursor ?? undefined) : undefined),
    enabled,
    retry: false,
  });
}

// No es una query reactiva a propósito, mismo motivo que getTestExecution en
// use-admin-workflows.ts: se pide una vez, al elegir una conversación del menú, no algo
// que se re-suscriba solo.
export function useLoadAdminConversation() {
  return useMutation({
    mutationFn: async ({
      id,
      organizationId,
      workflowId,
    }: {
      id: string;
      organizationId: string;
      workflowId: string;
    }) => api().findOne(id, organizationId, workflowId),
  });
}

export function useRenameAdminConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      organizationId,
      title,
    }: {
      id: string;
      organizationId: string;
      title: string;
    }) => api().rename(id, organizationId, title),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY, 'list'] }),
  });
}
