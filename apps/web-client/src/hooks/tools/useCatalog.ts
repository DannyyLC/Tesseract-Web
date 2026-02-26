import { useInfiniteQuery } from '@tanstack/react-query';
import RootApi from '@/app/_api_request_manager/_apis/root-api';
import { GetToolsDto } from '../../app/_model/tools.dto';

interface CatalogParams {
  search?: string | null;
  pageSize?: number;
}

/**
 * Hook para obtener el catálogo de tools con scroll infinito.
 * Usa cursor pagination hacia adelante (action: 'next').
 */
export function useInfiniteToolsCatalog(params: CatalogParams = {}) {
  const { search, pageSize = 10 } = params;

  return useInfiniteQuery({
    queryKey: ['tools', 'catalog', 'infinite', { search, pageSize }],
    queryFn: async ({ pageParam }) => {
      const api = RootApi.getInstance().getToolCatalogApi();
      return await api.getAllToolsWithFunctions({
        cursor: (pageParam as string | undefined) ?? null,
        action: pageParam ? 'next' : null,
        pageSize,
        search: search ?? null,
      });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      return lastPage.nextPageAvailable ? (lastPage.nextCursor ?? undefined) : undefined;
    },
    retry: false,
    staleTime: Infinity,
  });
}

/**
 * Helper para aplanar todas las páginas en un array plano de tools.
 */
export function flattenToolsCatalog(
  data: ReturnType<typeof useInfiniteToolsCatalog>['data']
): GetToolsDto[] {
  return data?.pages.flatMap((page) => page.items) ?? [];
}
