import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import RootApi from '@/lib/api/endpoints/root-api';
import { DatasetField, DatasetSearchRequest } from '@tesseract/types';

const api = () => RootApi.getInstance().getDatasetsApi();

// ─── Listado y detalle ────────────────────────────────────────────────────────

export function useDatasets() {
  return useQuery({
    queryKey: ['datasets', 'list'],
    queryFn: async () => api().list(),
    staleTime: 1000 * 60,
  });
}

export function useDataset(id: string) {
  return useQuery({
    queryKey: ['datasets', 'detail', id],
    queryFn: async () => api().getById(id),
    enabled: !!id,
    staleTime: 1000 * 60,
  });
}

export function useDatasetRecords(id: string, limit = 50, offset = 0, query = '') {
  return useQuery({
    queryKey: ['datasets', 'records', id, limit, offset, query],
    queryFn: async () => api().listRecords(id, { limit, offset, query: query || undefined }),
    enabled: !!id,
    // Las filas cambian cada vez que el cliente edita una celda: no vale la pena cachearlas.
    staleTime: 0,
  });
}

// ─── Mutaciones ───────────────────────────────────────────────────────────────

export function useDatasetMutations() {
  const queryClient = useQueryClient();

  const invalidateList = () => queryClient.invalidateQueries({ queryKey: ['datasets', 'list'] });

  const invalidateDetail = (id?: string) => {
    if (id) {
      queryClient.invalidateQueries({ queryKey: ['datasets', 'detail', id] });
    }
  };

  const invalidateRecords = (id?: string) => {
    if (id) {
      queryClient.invalidateQueries({ queryKey: ['datasets', 'records', id] });
    }
  };

  const createDataset = useMutation({
    mutationFn: async (data: { name: string; description?: string; fields: DatasetField[] }) =>
      api().create(data),
    onSuccess: invalidateList,
  });

  const updateDataset = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: { name?: string; description?: string | null };
    }) => api().update(id, data),
    onSuccess: (_result, variables) => {
      invalidateDetail(variables.id);
      invalidateList();
    },
  });

  const updateFields = useMutation({
    mutationFn: async ({ id, fields }: { id: string; fields: DatasetField[] }) =>
      api().updateFields(id, fields),
    onSuccess: (_result, variables) => {
      invalidateDetail(variables.id);
      // Un cambio de columnas cambia la forma de todas las filas mostradas.
      invalidateRecords(variables.id);
      invalidateList();
    },
  });

  const deleteDataset = useMutation({
    mutationFn: async (id: string) => api().remove(id),
    onSuccess: invalidateList,
  });

  const clearRecords = useMutation({
    mutationFn: async (id: string) => api().clearRecords(id),
    onSuccess: (_result, id) => {
      invalidateRecords(id);
      invalidateList();
    },
  });

  const createRecord = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api().createRecord(id, data),
    onSuccess: (_result, variables) => {
      invalidateRecords(variables.id);
      invalidateList();
    },
  });

  const updateRecord = useMutation({
    mutationFn: async ({
      id,
      recordId,
      data,
    }: {
      id: string;
      recordId: string;
      data: Record<string, unknown>;
    }) => api().updateRecord(id, recordId, data),
    onSuccess: (_result, variables) => invalidateRecords(variables.id),
  });

  const deleteRecord = useMutation({
    mutationFn: async ({ id, recordId }: { id: string; recordId: string }) =>
      api().deleteRecord(id, recordId),
    onSuccess: (_result, variables) => {
      invalidateRecords(variables.id);
      invalidateList();
    },
  });

  const deleteRecords = useMutation({
    mutationFn: async ({ id, recordIds }: { id: string; recordIds: string[] }) =>
      api().deleteRecords(id, recordIds),
    onSuccess: (_result, variables) => {
      invalidateRecords(variables.id);
      // El consumo de filas sale del listado, no del detalle: sin esto el banner de uso se queda
      // marcando las filas que se acaban de borrar.
      invalidateList();
    },
  });

  const importCsv = useMutation({
    mutationFn: async ({ id, csv, fileName }: { id: string; csv: string; fileName?: string }) =>
      api().importCsv(id, csv, fileName),
    onSuccess: (_result, variables) => {
      invalidateRecords(variables.id);
      invalidateList();
    },
  });

  const linkWorkflow = useMutation({
    mutationFn: async ({ id, workflowId }: { id: string; workflowId: string }) =>
      api().linkWorkflow(id, workflowId),
    onSuccess: (_result, variables) => {
      invalidateDetail(variables.id);
      invalidateList();
    },
  });

  const unlinkWorkflow = useMutation({
    mutationFn: async ({ id, workflowId }: { id: string; workflowId: string }) =>
      api().unlinkWorkflow(id, workflowId),
    onSuccess: (_result, variables) => {
      invalidateDetail(variables.id);
      invalidateList();
    },
  });

  // No enlaza nada: solo le avisa a soporte. Sin invalidación porque no cambia ningún dato.
  const requestWorkflowConnection = useMutation({
    mutationFn: async ({ id, workflowIds }: { id: string; workflowIds: string[] }) =>
      api().requestWorkflowConnection(id, workflowIds),
  });

  const search = useMutation({
    mutationFn: async ({ id, request }: { id: string; request: DatasetSearchRequest }) =>
      api().search(id, request),
  });

  return {
    createDataset,
    updateDataset,
    updateFields,
    deleteDataset,
    clearRecords,
    createRecord,
    updateRecord,
    deleteRecord,
    deleteRecords,
    importCsv,
    linkWorkflow,
    unlinkWorkflow,
    requestWorkflowConnection,
    search,
  };
}
