import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import RootApi from '@/lib/api/endpoints/root-api';
import { DENSE_PAGE_SIZE, DatasetField } from '@tesseract/types';

const KEY = 'admin-datasets';

const api = () => RootApi.getInstance().getDatasetsAdminApi();

// ─── Listado y detalle ────────────────────────────────────────────────────────

export function useAdminDatasets(organizationId: string) {
  return useQuery({
    queryKey: [KEY, 'list', organizationId],
    queryFn: async () => api().list(organizationId),
    enabled: !!organizationId,
    staleTime: 1000 * 60,
  });
}

export function useAdminDataset(organizationId: string, id: string) {
  return useQuery({
    queryKey: [KEY, 'detail', organizationId, id],
    queryFn: async () => api().getById(organizationId, id),
    enabled: !!organizationId && !!id,
    staleTime: 1000 * 60,
  });
}

export function useAdminDatasetRecords(
  organizationId: string,
  id: string,
  limit = DENSE_PAGE_SIZE,
  offset = 0,
  query = '',
) {
  return useQuery({
    queryKey: [KEY, 'records', organizationId, id, limit, offset, query],
    queryFn: async () =>
      api().listRecords(organizationId, id, { limit, offset, query: query || undefined }),
    enabled: !!organizationId && !!id,
    // Las filas cambian con cada edición; no vale la pena cachearlas.
    staleTime: 0,
  });
}

// ─── Mutaciones ───────────────────────────────────────────────────────────────

export function useAdminDatasetMutations() {
  const queryClient = useQueryClient();

  const invalidateList = (organizationId: string) =>
    queryClient.invalidateQueries({ queryKey: [KEY, 'list', organizationId] });

  const invalidateDetail = (organizationId: string, id?: string) => {
    if (id) queryClient.invalidateQueries({ queryKey: [KEY, 'detail', organizationId, id] });
  };

  const invalidateRecords = (organizationId: string, id?: string) => {
    if (id) queryClient.invalidateQueries({ queryKey: [KEY, 'records', organizationId, id] });
  };

  const createDataset = useMutation({
    mutationFn: async ({
      organizationId,
      data,
    }: {
      organizationId: string;
      data: { name: string; description?: string; fields: DatasetField[] };
    }) => api().create(organizationId, data),
    onSuccess: (_result, variables) => invalidateList(variables.organizationId),
  });

  const updateDataset = useMutation({
    mutationFn: async ({
      organizationId,
      id,
      data,
    }: {
      organizationId: string;
      id: string;
      data: { name?: string; description?: string | null };
    }) => api().update(organizationId, id, data),
    onSuccess: (_result, variables) => {
      invalidateDetail(variables.organizationId, variables.id);
      invalidateList(variables.organizationId);
    },
  });

  const updateFields = useMutation({
    mutationFn: async ({
      organizationId,
      id,
      fields,
    }: {
      organizationId: string;
      id: string;
      fields: DatasetField[];
    }) => api().updateFields(organizationId, id, fields),
    onSuccess: (_result, variables) => {
      invalidateDetail(variables.organizationId, variables.id);
      invalidateRecords(variables.organizationId, variables.id);
      invalidateList(variables.organizationId);
    },
  });

  const deleteDataset = useMutation({
    mutationFn: async ({ organizationId, id }: { organizationId: string; id: string }) =>
      api().remove(organizationId, id),
    onSuccess: (_result, variables) => invalidateList(variables.organizationId),
  });

  const clearRecords = useMutation({
    mutationFn: async ({ organizationId, id }: { organizationId: string; id: string }) =>
      api().clearRecords(organizationId, id),
    onSuccess: (_result, variables) => {
      invalidateRecords(variables.organizationId, variables.id);
      invalidateList(variables.organizationId);
    },
  });

  const createRecord = useMutation({
    mutationFn: async ({
      organizationId,
      id,
      data,
    }: {
      organizationId: string;
      id: string;
      data: Record<string, unknown>;
    }) => api().createRecord(organizationId, id, data),
    onSuccess: (_result, variables) => {
      invalidateRecords(variables.organizationId, variables.id);
      invalidateList(variables.organizationId);
    },
  });

  const updateRecord = useMutation({
    mutationFn: async ({
      organizationId,
      id,
      recordId,
      data,
    }: {
      organizationId: string;
      id: string;
      recordId: string;
      data: Record<string, unknown>;
    }) => api().updateRecord(organizationId, id, recordId, data),
    onSuccess: (_result, variables) => invalidateRecords(variables.organizationId, variables.id),
  });

  const deleteRecord = useMutation({
    mutationFn: async ({
      organizationId,
      id,
      recordId,
    }: {
      organizationId: string;
      id: string;
      recordId: string;
    }) => api().deleteRecord(organizationId, id, recordId),
    onSuccess: (_result, variables) => {
      invalidateRecords(variables.organizationId, variables.id);
      invalidateList(variables.organizationId);
    },
  });

  const deleteRecords = useMutation({
    mutationFn: async ({
      organizationId,
      id,
      recordIds,
    }: {
      organizationId: string;
      id: string;
      recordIds: string[];
    }) => api().deleteRecords(organizationId, id, recordIds),
    onSuccess: (_result, variables) => {
      invalidateRecords(variables.organizationId, variables.id);
      invalidateList(variables.organizationId);
    },
  });

  const importCsv = useMutation({
    mutationFn: async ({
      organizationId,
      id,
      csv,
      fileName,
    }: {
      organizationId: string;
      id: string;
      csv: string;
      fileName?: string;
    }) => api().importCsv(organizationId, id, csv, fileName),
    onSuccess: (_result, variables) => {
      invalidateRecords(variables.organizationId, variables.id);
      invalidateList(variables.organizationId);
    },
  });

  const linkWorkflow = useMutation({
    mutationFn: async ({
      organizationId,
      id,
      workflowId,
    }: {
      organizationId: string;
      id: string;
      workflowId: string;
    }) => api().linkWorkflow(organizationId, id, workflowId),
    onSuccess: (_result, variables) => {
      invalidateDetail(variables.organizationId, variables.id);
      invalidateList(variables.organizationId);
    },
  });

  const unlinkWorkflow = useMutation({
    mutationFn: async ({
      organizationId,
      id,
      workflowId,
    }: {
      organizationId: string;
      id: string;
      workflowId: string;
    }) => api().unlinkWorkflow(organizationId, id, workflowId),
    onSuccess: (_result, variables) => {
      invalidateDetail(variables.organizationId, variables.id);
      invalidateList(variables.organizationId);
    },
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
  };
}
