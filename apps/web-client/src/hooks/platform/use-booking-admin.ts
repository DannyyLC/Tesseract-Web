import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import RootApi from '@/lib/api/endpoints/root-api';

const BOOKING_CALENDAR_STATUS_KEY = ['booking', 'admin', 'status'];

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
    },
  });
}
