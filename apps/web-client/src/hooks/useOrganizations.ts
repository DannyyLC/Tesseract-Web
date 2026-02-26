import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import RootApi from '@/app/_api_request_manager/_apis/root-api';
import {
  UpdateOrganizationDto,
  InviteUserDto,
  AcceptInvitationDto,
} from '@tesseract/types';


// Hook para obtener el dashboard de la organización
export function useOrganizationDashboard() {
  return useQuery({
    queryKey: ['organization', 'dashboard'],
    queryFn: async () => {
      const api = RootApi.getInstance().getOrganizationsApi();
      return await api.getDashboardData();
    },
    retry: false,
  });
}

// Hook para mutaciones (Update, Delete)
export function useOrganizationMutations() {
  const queryClient = useQueryClient();

  const updateOrganization = useMutation({
    mutationFn: async (data: UpdateOrganizationDto) => {
      const api = RootApi.getInstance().getOrganizationsApi();
      return await api.update(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', 'dashboard'] });
    },
  });

  const deleteOrganization = useMutation({
    mutationFn: async (data: { confirmationText: string; code2FA?: string }) => {
      const api = RootApi.getInstance().getOrganizationsApi();
      return await api.delete(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', 'dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['users', 'stats'] });
      queryClient.invalidateQueries({ queryKey: ['organization', 'dashboard'] });
    },
  });


  const inviteUser = useMutation({
    mutationFn: async (data: InviteUserDto) => {
      const api = RootApi.getInstance().getOrganizationsApi();
      return await api.inviteUser(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', 'dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['users', 'stats'] });
      queryClient.invalidateQueries({ queryKey: ['organization', 'dashboard'] });
    },
  });

  return {
    updateOrganization,
    deleteOrganization,
    inviteUser,
  };
}

// Hook para aceptar invitación (público)
export function useAcceptInvitation() {
  return useMutation({
    mutationFn: async (data: AcceptInvitationDto) => {
      const api = RootApi.getInstance().getOrganizationsApi();
      return await api.acceptInvitation(data);
    },
  });
}
