import { useInfiniteQuery } from '@tanstack/react-query';
import RootApi from '@/app/_api_request_manager/_apis/root-api';
import { GetToolsDto } from '@tesseract/types';

interface UseToolCatalogParams {
  pageSize?: number;
  search?: string;
}

export function useToolCatalog(params: UseToolCatalogParams = {}) {
  const { pageSize = 20, search } = params;

  return useInfiniteQuery({
    queryKey: ['tool-catalog', 'infinite', { pageSize, search }],
    queryFn: async ({ pageParam }) => {
      const api = RootApi.getInstance().getToolCatalogApi();
      return await api.getAllToolsWithFunctions({
        cursor: (pageParam as string | undefined) ?? null,
        action: pageParam ? 'next' : null,
        pageSize,
        search: search || null,
      });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.nextPageAvailable ? (lastPage.nextCursor ?? undefined) : undefined,
    retry: false,
    staleTime: 1000 * 60 * 10, // 10 minutos — el catálogo cambia poco
  });
}

/**
 * Helper para aplanar las páginas del catálogo en un array plano.
 */
export function flattenToolCatalog(
  data: ReturnType<typeof useToolCatalog>['data']
): GetToolsDto[] {
  return data?.pages.flatMap((page) => page.items) ?? [];
}
