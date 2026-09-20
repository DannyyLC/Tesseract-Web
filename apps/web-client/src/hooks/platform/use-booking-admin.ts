import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import RootApi from '@/lib/api/endpoints/root-api';

const BOOKING_CALENDAR_STATUS_KEY = ['booking', 'admin', 'status'];
const BOOKING_CALENDARS_KEY = ['booking', 'admin', 'calendars'];

export function useBookingCalendarStatus() {
  return useQuery({
    queryKey: BOOKING_CALENDAR_STATUS_KEY,
    queryFn: async () => {
      const api = RootApi.getInstance().getBookingAdminApi();
      return await api.getStatus();
    },
  });
}

export function useDisconnectBookingCalendar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const api = RootApi.getInstance().getBookingAdminApi();
      return await api.disconnect();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BOOKING_CALENDAR_STATUS_KEY });
      queryClient.invalidateQueries({ queryKey: BOOKING_CALENDARS_KEY });
    },
  });
}

/**
 * Calendarios visibles de la cuenta de Google conectada (propios y compartidos con acceso de
 * escritura). Solo tiene sentido pedirlos con una cuenta ya conectada, así que `enabled` lo
 * ata al status.
 */
export function useBookingCalendars(connected: boolean) {
  return useQuery({
    queryKey: BOOKING_CALENDARS_KEY,
    queryFn: async () => {
      const api = RootApi.getInstance().getBookingAdminApi();
      return await api.getCalendars();
    },
    enabled: connected,
  });
}

export function useSelectBookingCalendar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (calendarId: string) => {
      const api = RootApi.getInstance().getBookingAdminApi();
      return await api.selectCalendar(calendarId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BOOKING_CALENDAR_STATUS_KEY });
    },
  });
}
