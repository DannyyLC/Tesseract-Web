import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import RootApi from '@/lib/api/endpoints/root-api';
import { ApiKeysQuery, CreateApiKeyDto, UpdateApiKeyDto } from '@tesseract/types';

/**
 * Listado paginado de api-keys. Con `workflowId` sirve a la sección del detalle de
 * un workflow; sin él, a la página global.
 */
export function useApiKeys(query: ApiKeysQuery = {}) {
  const { cursor = null, action = null, pageSize = 10, workflowId, search } = query;

  return useQuery({
    queryKey: ['api-keys', 'list', { cursor, action, pageSize, workflowId, search }],
    queryFn: async () => {
      const api = RootApi.getInstance().getApiKeysApi();
      return await api.findAll({ cursor, action, pageSize, workflowId, search });
    },
    // Sin esto, cada cambio de página vacía la lista y la sección da un salto.
    placeholderData: (previous) => previous,
  });
}

// Hook para traer los detalles de una api-key especifica
export function useApiKey(apiKeyId: string) {
  return useQuery({
    queryKey: ['api-keys', 'detail', apiKeyId],
    queryFn: async () => {
      const api = RootApi.getInstance().getApiKeysApi();
      return await api.findOne(apiKeyId);
    },
    enabled: !!apiKeyId,
  });
}

// Hook para mutaciones (Create, Update, Delete)
export function useApiKeyMutations() {
  const queryClient = useQueryClient();

  // Se invalida `['api-keys']` entero, sin afinar por página ni por workflow: la misma key
  // aparece en la vista global y en la sección de su workflow, y las dos tienen que refrescarse.
  const invalidateAll = () => queryClient.invalidateQueries({ queryKey: ['api-keys'] });

  const createApiKey = useMutation({
    mutationFn: async (data: CreateApiKeyDto) => {
      const api = RootApi.getInstance().getApiKeysApi();
      return await api.create(data);
    },
    onSuccess: invalidateAll,
  });

  const updateApiKey = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateApiKeyDto }) => {
      const api = RootApi.getInstance().getApiKeysApi();
      return await api.update(id, data);
    },
    onSuccess: invalidateAll,
  });

  const deleteApiKey = useMutation({
    mutationFn: async (id: string) => {
      const api = RootApi.getInstance().getApiKeysApi();
      return await api.delete(id);
    },
    onSuccess: invalidateAll,
  });

  return {
    createApiKey,
    updateApiKey,
    deleteApiKey,
  };
}
