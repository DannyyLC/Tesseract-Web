import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import RootApi from '@/lib/api/endpoints/root-api';
import {
  BlockEndUserDto,
  CreateEndUserDto,
  DEFAULT_PAGE_SIZE,
  EndUsersQuery,
  UpdateEndUserDto,
} from '@tesseract/types';

/** Listado paginado de contactos, con filtro por estado de bloqueo y búsqueda. */
export function useEndUsers(query: EndUsersQuery = {}) {
  const { cursor = null, action = null, pageSize = DEFAULT_PAGE_SIZE, search, blocked = 'all' } = query;

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

  const createEndUser = useMutation({
    mutationFn: async (data: CreateEndUserDto) => {
      const api = RootApi.getInstance().getEndUsersApi();
      return await api.create(data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['end-users'] }),
  });

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

  const updateEndUser = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateEndUserDto }) => {
      const api = RootApi.getInstance().getEndUsersApi();
      return await api.update(id, data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['end-users'] }),
  });

  // Borrar es irreversible y se lleva en cascada las conversaciones del contacto (ver schema),
  // así que invalida igual que bloquear: si no, la bandeja se queda con hilos de alguien que
  // ya no existe.
  const deleteEndUser = useMutation({
    mutationFn: async (id: string) => {
      const api = RootApi.getInstance().getEndUsersApi();
      return await api.remove(id);
    },
    onSuccess: invalidateAll,
  });

  return { createEndUser, blockEndUser, unblockEndUser, updateEndUser, deleteEndUser };
}
