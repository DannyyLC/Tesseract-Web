import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import RootApi from '@/app/_api_request_manager/_apis/root-api';
import { UpdateUserDto } from '@tesseract/types';

interface DashboardParams {
  cursor?: string | null;
  pageSize?: number;
  action?: 'next' | 'prev' | null;
  search?: string;
  role?: string;
  isActive?: boolean;
}

// Hook para obtener el dashboard de usuarios
export function useUsersDashboard(params: DashboardParams = {}) {
  return useQuery({
    queryKey: ['users', 'dashboard', params],
    queryFn: async () => {
      const api = RootApi.getInstance().getUsersApi();
      return await api.getDashboardData(params);
    },
    retry: false,
    staleTime: 5000,
  });
}

export function usePendingInvitations() {
  return useQuery({
    queryKey: ['users', 'pending-invitations'],
    queryFn: async () => {
      const api = RootApi.getInstance().getUsersApi();
      return await api.getPendingInvitations();
    },
    retry: false,
    staleTime: 5000,
  });
}

// Hook para obtener el dashboard de usuarios con scroll infinito
export function useInfiniteUsersDashboard(params: DashboardParams = {}) {
  return useInfiniteQuery({
    queryKey: ['users', 'dashboard', 'infinite', params],
    queryFn: async ({ pageParam }) => {
      const api = RootApi.getInstance().getUsersApi();
      return await api.getDashboardData({
        ...params,
        cursor: pageParam as string | undefined,
        action: 'next',
      });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      return lastPage.hasMore ? lastPage.nextCursor : undefined;
    },
    retry: false,
    staleTime: 5000,
  });
}

// Hook para estadisticas de usuarios
export function useUserStats({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['users', 'stats'],
    queryFn: async () => {
      const api = RootApi.getInstance().getUsersApi();
      return await api.getStats();
    },
    enabled,
  });
}

// Hook para traer los detalles de un usuario especifico
export function useUser(userId: string) {
  return useQuery({
    queryKey: ['users', 'detail', userId],
    queryFn: async () => {
      const api = RootApi.getInstance().getUsersApi();
      return await api.findOne(userId);
    },
    enabled: !!userId,
  });
}

// Hook para mutaciones (Update, Delete)
export function useUserMutations() {
  const queryClient = useQueryClient();

  const updateUser = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateUserDto }) => {
      const api = RootApi.getInstance().getUsersApi();
      return await api.update(id, data);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['users', 'detail', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['users', 'dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['users', 'stats'] }); // Update stats if active status changed
    },
  });

  const deleteUser = useMutation({
    mutationFn: async (id: string) => {
      const api = RootApi.getInstance().getUsersApi();
      return await api.remove(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', 'dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['users', 'stats'] });
    },
  });

  const transferOwnership = useMutation({
    mutationFn: async (id: string) => {
      const api = RootApi.getInstance().getUsersApi();
      return await api.transferOwnership(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', 'dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['users', 'stats'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });

  const leaveOrganization = useMutation({
    mutationFn: async (data: { confirmationText: string; code2FA?: string }) => {
      const api = RootApi.getInstance().getUsersApi();
      return await api.leaveOrganization(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', 'dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['users', 'stats'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });

  return {
    updateUser,
    deleteUser,
    transferOwnership,
    leaveOrganization,
  };
}
