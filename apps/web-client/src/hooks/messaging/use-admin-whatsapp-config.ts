import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import RootApi from '@/lib/api/endpoints/root-api';
import type {
  CreateTemplateAdminInput,
  CreateWhatsappConfigAdminInput,
  UpdateTemplateAdminInput,
  UpdateWhatsappConfigAdminInput,
} from '@/lib/api/endpoints/messaging/whatsapp-config/whatsapp-config-admin-api';

const KEY = 'admin-whatsapp-config';
const api = () => RootApi.getInstance().getWhatsappConfigAdminApi();

export function useAdminWhatsappNumbers(organizationId: string) {
  return useQuery({
    queryKey: [KEY, 'list', organizationId],
    queryFn: async () => api().list(organizationId),
    enabled: !!organizationId,
    retry: false,
  });
}

export function useAdminWhatsappMutations(organizationId: string) {
  const queryClient = useQueryClient();
  const invalidateList = () =>
    queryClient.invalidateQueries({ queryKey: [KEY, 'list', organizationId] });

  const createConfig = useMutation({
    mutationFn: async (data: CreateWhatsappConfigAdminInput) => api().create(organizationId, data),
    onSuccess: invalidateList,
  });

  const updateConfig = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateWhatsappConfigAdminInput }) =>
      api().update(organizationId, id, data),
    onSuccess: invalidateList,
  });

  const deleteConfig = useMutation({
    mutationFn: async (id: string) => api().remove(organizationId, id),
    onSuccess: invalidateList,
  });

  const setActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      api().setActive(organizationId, id, isActive),
    onSuccess: invalidateList,
  });

  return { createConfig, updateConfig, deleteConfig, setActive };
}

export function useAdminWhatsappTemplates(organizationId: string, configId: string | null) {
  return useQuery({
    queryKey: [KEY, 'templates', configId],
    queryFn: async () => api().listTemplates(organizationId, configId!),
    enabled: !!organizationId && !!configId,
    retry: false,
  });
}

export function useAdminWhatsappTemplateMutations(organizationId: string, configId: string) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [KEY, 'templates', configId] });

  const createTemplate = useMutation({
    mutationFn: async (data: CreateTemplateAdminInput) =>
      api().createTemplate(organizationId, configId, data),
    onSuccess: invalidate,
  });

  const updateTemplate = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateTemplateAdminInput }) =>
      api().updateTemplate(organizationId, id, data),
    onSuccess: invalidate,
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => api().deleteTemplate(organizationId, id),
    onSuccess: invalidate,
  });

  return { createTemplate, updateTemplate, deleteTemplate };
}
