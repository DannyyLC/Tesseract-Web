import RootApi from '@/lib/api/endpoints/root-api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export function useMessengerMutations() {
  const queryClient = useQueryClient();

  const setisActiveStatus = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: boolean }) => {
      const api = RootApi.getInstance().getMessengerConfigApi();
      return await api.updateIsActiveStatus(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messenger', 'list'] });
    },
  });

  const deleteMessengerConfig = useMutation({
    mutationFn: async (id: string) => {
      const api = RootApi.getInstance().getMessengerConfigApi();
      return await api.deleteMessengerConfiguration(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messenger', 'list'] });
    },
  });

  const addMessengerConfiguration = useMutation({
    mutationFn: async ({
      workflowId,
      pageId,
      pageName,
      pageAccessToken,
      appSecret,
    }: {
      workflowId: string;
      pageId: string;
      pageName?: string;
      pageAccessToken?: string;
      appSecret?: string;
    }) => {
      const api = RootApi.getInstance().getMessengerConfigApi();
      return await api.addMessengerConfiguration({
        workflowId,
        pageId,
        pageName,
        pageAccessToken,
        appSecret,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messenger', 'list'] });
    },
  });

  return {
    setisActiveStatus,
    deleteMessengerConfig,
    addMessengerConfiguration,
  };
}

export function useMessengerPages(workflowId: string) {
  return useQuery({
    queryKey: ['messenger', 'list', workflowId],
    queryFn: async () => {
      const api = RootApi.getInstance().getMessengerConfigApi();
      return await api.getMessengerConfigurationsByWorkflowId(workflowId);
    },
    enabled: !!workflowId,
  });
}
