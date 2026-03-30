import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import RootApi from '@/app/_api_request_manager/_apis/root-api';
import { CreateApiKeyDto, UpdateApiKeyDto } from '@tesseract/types';

// Hook para obtener la listas de api-keys
export function useApiKeysList() {
  return useQuery({
    queryKey: ['api-keys', 'list'],
    queryFn: async () => {
      const api = RootApi.getInstance().getApiKeysApi();
      return await api.findAll();
    },
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

  const createApiKey = useMutation({
    mutationFn: async (data: CreateApiKeyDto) => {
      const api = RootApi.getInstance().getApiKeysApi();
      return await api.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys', 'list'] });
    },
  });

  const updateApiKey = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateApiKeyDto }) => {
      const api = RootApi.getInstance().getApiKeysApi();
      return await api.update(id, data);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['api-keys', 'detail', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['api-keys', 'list'] });
    },
  });

  const deleteApiKey = useMutation({
    mutationFn: async (id: string) => {
      const api = RootApi.getInstance().getApiKeysApi();
      return await api.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys', 'list'] });
    },
  });

  return {
    createApiKey,
    updateApiKey,
    deleteApiKey,
  };
}
