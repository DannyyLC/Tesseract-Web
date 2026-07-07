import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import RootApi from '@/lib/api/endpoints/root-api';
import type {
  CreateLlmCategoryInput,
  UpdateLlmCategoryInput,
} from '@/lib/api/endpoints/automation/llm-models/llm-categories-api';

const KEY = 'llm-categories';

// Listado de categorías (opcionalmente por estado)
export function useLlmCategories(isActive?: boolean) {
  return useQuery({
    queryKey: [KEY, 'list', isActive ?? 'all'],
    queryFn: async () => {
      const api = RootApi.getInstance().getLlmCategoriesApi();
      return await api.findAll(isActive);
    },
    retry: false,
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
