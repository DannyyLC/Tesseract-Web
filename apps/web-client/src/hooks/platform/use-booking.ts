import { useQuery, useMutation } from '@tanstack/react-query';
import RootApi from '@/lib/api/endpoints/root-api';
import { CreateBookingDto } from '@tesseract/types';

export function useBookingEventTypes() {
  return useQuery({
    queryKey: ['booking', 'event-types'],
    queryFn: async () => {
      const api = RootApi.getInstance().getBookingApi();
      return await api.getEventTypes();
    },
    staleTime: 1000 * 60 * 60, // Son ofertas fijas del negocio, no cambian en la sesión.
  });
}

export function useBookingAvailability(eventTypeId: string | undefined, date: string | undefined) {
  return useQuery({
    queryKey: ['booking', 'availability', eventTypeId, date],
    queryFn: async () => {
      const api = RootApi.getInstance().getBookingApi();
      return await api.getAvailability(eventTypeId!, date!);
    },
    enabled: !!eventTypeId && !!date,
    staleTime: 1000 * 30,
  });
}

/** Días con hueco del rango visible, para apagar en la rejilla los que están llenos. */
export function useBookingAvailableDays(
  eventTypeId: string | undefined,
  from: string | undefined,
  to: string | undefined,
) {
  return useQuery({
    queryKey: ['booking', 'available-days', eventTypeId, from, to],
    queryFn: async () => {
      const api = RootApi.getInstance().getBookingApi();
      return await api.getAvailableDays(eventTypeId!, from!, to!);
    },
    enabled: !!eventTypeId && !!from && !!to,
    staleTime: 1000 * 30,
  });
}

export function useCreateBooking() {
  return useMutation({
    mutationFn: async (dto: CreateBookingDto) => {
      const api = RootApi.getInstance().getBookingApi();
      return await api.createBooking(dto);
    },
  });
}
