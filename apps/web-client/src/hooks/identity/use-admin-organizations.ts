import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import RootApi from '@/lib/api/endpoints/root-api';
import type {
  AdminOrganizationsQuery,
  UpdateAdminCustomLimitsInput,
  ToggleAdminOverageInput,
} from '@/lib/api/endpoints/identity/organizations/organizations-admin-api';

const KEY = 'admin-organizations';

// Listado de organizaciones (búsqueda + paginado)
export function useAdminOrganizations(query: AdminOrganizationsQuery = {}) {
  return useQuery({
    queryKey: [KEY, 'list', query],
    queryFn: async () => {
      const api = RootApi.getInstance().getOrganizationsAdminApi();
      return await api.findAll(query);
    },
    retry: false,
    staleTime: 5000,
  });
}

// Detalle de una organización
export function useAdminOrganization(id: string) {
  return useQuery({
    queryKey: [KEY, 'detail', id],
    queryFn: async () => {
      const api = RootApi.getInstance().getOrganizationsAdminApi();
      return await api.findOne(id);
    },
    enabled: !!id,
    retry: false,
  });
}

// Mutaciones: límites custom, overage, desactivar/reactivar
export function useAdminOrganizationMutations() {
  const queryClient = useQueryClient();
  const invalidate = (id: string) => {
    queryClient.invalidateQueries({ queryKey: [KEY, 'detail', id] });
    queryClient.invalidateQueries({ queryKey: [KEY, 'list'] });
  };

  const updateCustomLimits = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateAdminCustomLimitsInput }) => {
      const api = RootApi.getInstance().getOrganizationsAdminApi();
      return await api.updateCustomLimits(id, data);
    },
    onSuccess: (_data, variables) => invalidate(variables.id),
  });

  const toggleOverage = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ToggleAdminOverageInput }) => {
      const api = RootApi.getInstance().getOrganizationsAdminApi();
      return await api.toggleOverage(id, data);
    },
    onSuccess: (_data, variables) => invalidate(variables.id),
  });

  const deactivate = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const api = RootApi.getInstance().getOrganizationsAdminApi();
      return await api.deactivate(id, reason);
    },
    onSuccess: (_data, variables) => invalidate(variables.id),
  });

  const reactivate = useMutation({
    mutationFn: async (id: string) => {
      const api = RootApi.getInstance().getOrganizationsAdminApi();
      return await api.reactivate(id);
    },
    onSuccess: (_data, id) => invalidate(id),
  });

  return { updateCustomLimits, toggleOverage, deactivate, reactivate };
}
