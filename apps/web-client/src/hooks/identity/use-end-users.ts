import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import RootApi from '@/lib/api/endpoints/root-api';
import { BlockEndUserDto, EndUsersQuery } from '@tesseract/types';

/** Listado paginado de contactos, con filtro por estado de bloqueo y búsqueda. */
export function useEndUsers(query: EndUsersQuery = {}) {
  const { cursor = null, action = null, pageSize = 10, search, blocked = 'all' } = query;

  return useQuery({
    queryKey: ['end-users', 'list', { cursor, action, pageSize, search, blocked }],
    queryFn: async () => {
      const api = RootApi.getInstance().getEndUsersApi();
      return await api.findAll({ cursor, action, pageSize, search, blocked });
    },
    // Sin esto, cada cambio de página o de filtro vacía la lista y la vista da un salto.
    placeholderData: (previous) => previous,
  });
}

export function useEndUserMutations() {
  const queryClient = useQueryClient();

  // Bloquear cierra conversaciones, así que también hay que refrescar la bandeja: si no, la
  // conversación que acaba de cerrarse sigue viéndose activa hasta que alguien recargue.
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['end-users'] });
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
  };

  const blockEndUser = useMutation({
    mutationFn: async ({ id, data }: { id: string; data?: BlockEndUserDto }) => {
      const api = RootApi.getInstance().getEndUsersApi();
      return await api.block(id, data ?? {});
    },
    onSuccess: invalidateAll,
  });

  const unblockEndUser = useMutation({
    mutationFn: async (id: string) => {
      const api = RootApi.getInstance().getEndUsersApi();
      return await api.unblock(id);
    },
    onSuccess: invalidateAll,
  });

  return { blockEndUser, unblockEndUser };
}
