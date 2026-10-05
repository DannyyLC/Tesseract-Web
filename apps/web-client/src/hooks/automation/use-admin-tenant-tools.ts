import { useQuery } from '@tanstack/react-query';
import RootApi from '@/lib/api/endpoints/root-api';
import type { AdminTenantToolsQuery } from '@/lib/api/endpoints/automation/tools/tenant-tools-admin-api';

const KEY = 'admin-tenant-tools';

export function useAdminTenantTools(query: AdminTenantToolsQuery = {}) {
  return useQuery({
    queryKey: [KEY, 'list', query],
    queryFn: async () => {
      const api = RootApi.getInstance().getTenantToolsAdminApi();
      return await api.findAll(query);
    },
    retry: false,
    staleTime: 5000,
  });
}

/** Números de arriba del listado de integraciones. */
export function useAdminTenantToolsOverview() {
  return useQuery({
    queryKey: [KEY, 'overview'],
    queryFn: () => RootApi.getInstance().getTenantToolsAdminApi().getOverview(),
    retry: false,
    staleTime: 1000 * 60,
  });
}
