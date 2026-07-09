import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import RootApi from '@/lib/api/endpoints/root-api';
import type {
  CreateLlmCategoryInput,
  UpdateLlmCategoryInput,
  LlmCategoriesQuery,
} from '@/lib/api/endpoints/automation/llm-models/llm-categories-api';

const KEY = 'llm-categories';

// Listado de categorías (opcionalmente por estado, paginado)
export function useLlmCategories(query: LlmCategoriesQuery = {}) {
  return useQuery({
    queryKey: [KEY, 'list', query],
    queryFn: async () => {
      const api = RootApi.getInstance().getLlmCategoriesApi();
      return await api.findAll(query);
    },
    retry: false,
    staleTime: 5000,
  });
}

// Listado de categorías con scroll infinito
export function useInfiniteLlmCategories(query: LlmCategoriesQuery = {}) {
  return useInfiniteQuery({
    queryKey: [KEY, 'list', 'infinite', query],
    queryFn: async ({ pageParam = 1 }) => {
      const api = RootApi.getInstance().getLlmCategoriesApi();
      return await api.findAll({ ...query, page: pageParam as number, limit: 20 });
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.meta.page < lastPage.meta.totalPages) {
        return lastPage.meta.page + 1;
      }
      return undefined;
    },
    staleTime: 5000,
  });
}

// Mutaciones: crear, actualizar, eliminar
export function useLlmCategoryMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [KEY, 'list'] });
    // Los modelos muestran la categoría por relación: refrescar también su lista.
    queryClient.invalidateQueries({ queryKey: ['llm-models', 'list'] });
  };

  const createCategory = useMutation({
    mutationFn: async (data: CreateLlmCategoryInput) => {
      const api = RootApi.getInstance().getLlmCategoriesApi();
      return await api.create(data);
    },
    onSuccess: invalidate,
  });

  const updateCategory = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateLlmCategoryInput }) => {
      const api = RootApi.getInstance().getLlmCategoriesApi();
      return await api.update(id, data);
    },
    onSuccess: invalidate,
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      const api = RootApi.getInstance().getLlmCategoriesApi();
      return await api.remove(id);
    },
    onSuccess: invalidate,
  });

  return { createCategory, updateCategory, deleteCategory };
}
