import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import RootApi from '@/lib/api/endpoints/root-api';
import { PendingAnnouncementDto } from '@tesseract/types';

const KEY = 'announcements-pending';

const api = () => RootApi.getInstance().getAnnouncementsApi();

/**
 * Hasta 3 anuncios bloqueantes pendientes para el usuario actual. Sin `refetchInterval`
 * ni `refetchOnWindowFocus` a propósito: es una consulta de "qué me tocó ver al entrar",
 * no un feed en vivo — un anuncio nuevo se recoge en la siguiente navegación completa o
 * al invalidar la key tras publicar uno desde /admin en la misma sesión de pruebas.
 */
export function usePendingAnnouncements(locale: string, enabled: boolean) {
  return useQuery({
    queryKey: [KEY, locale],
    queryFn: async () => api().getPending(locale),
    enabled,
    retry: false,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useAnnouncementMutations(locale: string) {
  const queryClient = useQueryClient();

  // Quita el anuncio recién cerrado de la cache local en vez de invalidar: así se
  // encadena el siguiente pendiente sin latencia y sin que el que se acaba de cerrar
  // parpadee de vuelta mientras React Query revalida en segundo plano.
  const removeFromCache = (userNotificationId: string) => {
    queryClient.setQueryData<PendingAnnouncementDto[]>([KEY, locale], (old) =>
      (old ?? []).filter((a) => a.userNotificationId !== userNotificationId),
    );
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const dismiss = useMutation({
    mutationFn: async (userNotificationId: string) => api().dismiss(userNotificationId),
    onSuccess: (_data, userNotificationId) => removeFromCache(userNotificationId),
  });

  const registerCtaClick = useMutation({
    mutationFn: async (userNotificationId: string) => api().registerCtaClick(userNotificationId),
  });

  return { dismiss, registerCtaClick };
}
