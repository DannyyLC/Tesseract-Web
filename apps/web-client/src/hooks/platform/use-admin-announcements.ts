import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import RootApi from '@/lib/api/endpoints/root-api';
import { CreateAnnouncementDto, UpdateAnnouncementDto, UserRole } from '@tesseract/types';
import type { AdminAnnouncementsQuery } from '@/lib/api/endpoints/platform/announcements/announcements-admin-api';

const KEY = 'admin-announcements';

const api = () => RootApi.getInstance().getAnnouncementsAdminApi();

export function useAdminAnnouncements(query: AdminAnnouncementsQuery = {}) {
  return useQuery({
    queryKey: [KEY, 'list', query],
    queryFn: async () => api().list(query),
    retry: false,
    staleTime: 5000,
  });
}

export function useAdminAnnouncement(id: string) {
  return useQuery({
    queryKey: [KEY, 'detail', id],
    queryFn: async () => api().getById(id),
    enabled: !!id,
    retry: false,
  });
}

/**
 * No es una query reactiva a propósito: el conteo se pide bajo demanda cuando el
 * operador cambia el destino en el formulario, no algo que se re-suscriba solo.
 */
export function useAudiencePreview() {
  return useMutation({
    mutationFn: async ({
      organizationIds,
      roles,
    }: {
      organizationIds: string[];
      roles: UserRole[];
    }) => api().audiencePreview(organizationIds, roles),
  });
}

export function useAdminAnnouncementMutations() {
  const queryClient = useQueryClient();

  const invalidate = (id?: string) => {
    if (id) queryClient.invalidateQueries({ queryKey: [KEY, 'detail', id] });
    queryClient.invalidateQueries({ queryKey: [KEY, 'list'] });
  };

  const createAnnouncement = useMutation({
    mutationFn: async (dto: CreateAnnouncementDto) => api().create(dto),
    onSuccess: () => invalidate(),
  });

  const updateAnnouncement = useMutation({
    mutationFn: async ({ id, dto }: { id: string; dto: UpdateAnnouncementDto }) =>
      api().update(id, dto),
    onSuccess: (_data, variables) => invalidate(variables.id),
  });

  const publish = useMutation({
    mutationFn: async (id: string) => api().publish(id),
    onSuccess: (_data, id) => invalidate(id),
  });

  const unpublish = useMutation({
    mutationFn: async (id: string) => api().unpublish(id),
    onSuccess: (_data, id) => invalidate(id),
  });

  return { createAnnouncement, updateAnnouncement, publish, unpublish };
}
