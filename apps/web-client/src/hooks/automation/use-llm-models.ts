import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import RootApi from '@/lib/api/endpoints/root-api';
import type {
  LlmModelsQuery,
  CreateLlmModelInput,
  UpdateLlmModelInput,
  SupersedePricingInput,
} from '@/lib/api/endpoints/automation/llm-models/llm-models-api';

const KEY = 'llm-models';

// Listado paginado + filtros
export function useLlmModels(query: LlmModelsQuery = {}) {
  return useQuery({
    queryKey: [KEY, 'list', query],
    queryFn: async () => {
      const api = RootApi.getInstance().getLlmModelsApi();
      return await api.findAll(query);
    },
    retry: false,
    staleTime: 5000,
  });
}

// Detalle de un modelo
export function useLlmModel(id: string) {
  return useQuery({
    queryKey: [KEY, 'detail', id],
    queryFn: async () => {
      const api = RootApi.getInstance().getLlmModelsApi();
      return await api.findOne(id);
    },
    enabled: !!id,
  });
}

// Mutaciones: crear, actualizar metadatos, cambio de precio versionado, desactivar
export function useLlmModelMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [KEY, 'list'] });

  const createModel = useMutation({
    mutationFn: async (data: CreateLlmModelInput) => {
      const api = RootApi.getInstance().getLlmModelsApi();
      return await api.create(data);
    },
    onSuccess: invalidate,
  });

  const updateModel = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateLlmModelInput }) => {
      const api = RootApi.getInstance().getLlmModelsApi();
      return await api.update(id, data);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [KEY, 'detail', variables.id] });
      invalidate();
    },
  });

  const supersedePricing = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: SupersedePricingInput }) => {
      const api = RootApi.getInstance().getLlmModelsApi();
      return await api.supersedePricing(id, data);
    },
    onSuccess: invalidate,
  });

  const deactivateModel = useMutation({
    mutationFn: async (id: string) => {
      const api = RootApi.getInstance().getLlmModelsApi();
      return await api.remove(id);
    },
    onSuccess: invalidate,
  });

  return { createModel, updateModel, supersedePricing, deactivateModel };
}
