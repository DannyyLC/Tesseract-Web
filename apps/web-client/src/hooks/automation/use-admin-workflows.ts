import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import RootApi from '@/lib/api/endpoints/root-api';
import type {
  AdminWorkflowsQuery,
  CloneWorkflowInput,
  CreateWorkflowAdminInput,
  SaveConfigInput,
  WorkflowConfig,
} from '@/lib/api/endpoints/automation/workflows/workflows-admin-api';
import type { AdminOrganizationsQuery } from '@/lib/api/endpoints/identity/organizations/organizations-admin-api';
import WorkflowsAdminTestStream from '@/lib/api/endpoints/automation/workflows/workflows-admin-test-stream';

const KEY = 'admin-workflows';
const ORG_KEY = 'admin-organizations';

const api = () => RootApi.getInstance().getWorkflowsAdminApi();
const orgApi = () => RootApi.getInstance().getOrganizationsAdminApi();

// ---------------------------------------------------------------- organizaciones

/** Selector de organización: paginado incremental para el <InfiniteSelect>. */
export function useInfiniteAdminOrganizations(query: AdminOrganizationsQuery = {}) {
  return useInfiniteQuery({
    queryKey: [ORG_KEY, 'infinite', query],
    queryFn: async ({ pageParam }) => orgApi().findAll({ ...query, page: pageParam, limit: 20 }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined,
    retry: false,
  });
}

// ---------------------------------------------------------------- workflows

export function useAdminWorkflows(query: AdminWorkflowsQuery = {}, enabled = true) {
  return useQuery({
    queryKey: [KEY, 'list', query],
    queryFn: async () => api().findAll(query),
    enabled,
    retry: false,
    staleTime: 5000,
  });
}

/**
 * Detalle CON el config. `staleTime: Infinity` a propósito: el editor trabaja sobre
 * una copia local y un refetch en segundo plano podría reemplazar el documento base
 * mientras hay cambios sin guardar.
 */
export function useAdminWorkflow(id: string) {
  return useQuery({
    queryKey: [KEY, 'detail', id],
    queryFn: async () => api().findOne(id),
    enabled: !!id,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

/** Catálogo de nodos + modelos activos. Cambian poco, así que se cachean por sesión. */
export function useEditorContext() {
  return useQuery({
    queryKey: [KEY, 'editor-context'],
    queryFn: async () => api().getEditorContext(),
    retry: false,
    staleTime: 10 * 60 * 1000,
  });
}

export function useWorkflowVersions(id: string, page = 1, enabled = true) {
  return useQuery({
    queryKey: [KEY, 'versions', id, page],
    queryFn: async () => api().listVersions(id, page),
    enabled: !!id && enabled,
    retry: false,
  });
}

export function useVersionDiff(id: string, versionId: string | null) {
  return useQuery({
    queryKey: [KEY, 'diff', id, versionId],
    queryFn: async () => api().diffVersion(id, versionId!),
    enabled: !!id && !!versionId,
    retry: false,
  });
}

export function useAdminWorkflowMutations() {
  const queryClient = useQueryClient();

  const invalidateList = () => queryClient.invalidateQueries({ queryKey: [KEY, 'list'] });
  const invalidateWorkflow = (id: string) => {
    queryClient.invalidateQueries({ queryKey: [KEY, 'detail', id] });
    queryClient.invalidateQueries({ queryKey: [KEY, 'versions', id] });
    invalidateList();
  };

  const saveConfig = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: SaveConfigInput }) =>
      api().saveConfig(id, input),
    onSuccess: (_data, variables) => invalidateWorkflow(variables.id),
  });

  const validateConfig = useMutation({
    mutationFn: async ({ id, config }: { id: string; config: WorkflowConfig }) =>
      api().validateConfig(id, config),
  });

  const updateMeta = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api().updateMeta(id, data),
    onSuccess: (_data, variables) => invalidateWorkflow(variables.id),
  });

  const restoreVersion = useMutation({
    mutationFn: async ({
      id,
      versionId,
      expectedVersion,
      note,
    }: {
      id: string;
      versionId: string;
      expectedVersion: number;
      note?: string;
    }) => api().restoreVersion(id, versionId, expectedVersion, note),
    onSuccess: (_data, variables) => invalidateWorkflow(variables.id),
  });

  const createWorkflow = useMutation({
    mutationFn: async (data: CreateWorkflowAdminInput) => api().create(data),
    onSuccess: invalidateList,
  });

  const cloneWorkflow = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CloneWorkflowInput }) =>
      api().clone(id, data),
    onSuccess: invalidateList,
  });

  const removeWorkflow = useMutation({
    mutationFn: async (id: string) => api().remove(id),
    onSuccess: (_data, id) => invalidateWorkflow(id),
  });

  const restoreWorkflow = useMutation({
    mutationFn: async (id: string) => api().restore(id),
    onSuccess: (_data, id) => invalidateWorkflow(id),
  });

  return {
    saveConfig,
    validateConfig,
    updateMeta,
    restoreVersion,
    createWorkflow,
    cloneWorkflow,
    removeWorkflow,
    restoreWorkflow,
  };
}

// ---------------------------------------------------------------- test execute (admin)

/**
 * Probar un workflow interno desde el panel de admin, en streaming (estilo chat).
 * Calca `useExecuteStream` (hooks/automation/use-workflows.ts): estado local en vez de
 * `useMutation` porque necesita callbacks incrementales token a token, no un único
 * resultado al final.
 */
export function useAdminTestExecuteStream() {
  const [messages, setMessages] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<any>(null);

  const execute = async (
    id: string,
    organizationId: string,
    input: Record<string, any>,
    metadata?: Record<string, any>,
    onEvent?: (event: string, data: any) => void,
  ) => {
    setIsStreaming(true);
    setMessages('');
    setError(null);

    try {
      await WorkflowsAdminTestStream.testExecuteStream(id, organizationId, input, metadata, {
        onChunk: (chunk) => setMessages((prev) => prev + chunk),
        onEvent,
        onError: (err) => {
          setError(err);
          setIsStreaming(false);
        },
        onComplete: () => setIsStreaming(false),
      });
    } catch (e) {
      setError(e);
      setIsStreaming(false);
    }
  };

  const clear = () => {
    setMessages('');
    setError(null);
    setIsStreaming(false);
  };

  return { execute, messages, isStreaming, error, clear };
}
