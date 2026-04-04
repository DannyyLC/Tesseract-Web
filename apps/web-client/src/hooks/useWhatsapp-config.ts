import RootApi from "@/app/_api_request_manager/_apis/root-api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from 'react';
import useEvents from '@/hooks/useEvents';
import { WhatsAppConfig, ENDPOINT_EVENTS, TYPE_EVENTS } from "@tesseract/types";


export function useWhatsappMutations() {
  const queryClient = useQueryClient();

  const setisActiveStatus = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: boolean }) => {
      const api = RootApi.getInstance().getWhatsappConfigApi();
      return await api.updateIsActiveStatus(id, data);
    },
  });

  const deleteWhatsappConfig = useMutation({
    mutationFn: async (id: string) => {
      const api = RootApi.getInstance().getWhatsappConfigApi();
      return await api.deleteWhatsappConfiguration(id);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'list'] });
    },
  });

  const addWhatsappConfiguration = useMutation({
    mutationFn: async ({ workflowId, phoneNumber }: { workflowId: string; phoneNumber: string }) => {
      const api = RootApi.getInstance().getWhatsappConfigApi();
      return await api.addWhatsappConfiguration({ workflowId, phoneNumber });
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'list'] });
    },

  });

  return {
    setisActiveStatus,
    deleteWhatsappConfig,
    addWhatsappConfiguration,
  };

}

export function useWhatsappNumbers(workflowId: string) {
  return useQuery({
    queryKey: ['whatsapp', 'list', workflowId],
    queryFn: async () => {
      const api = RootApi.getInstance().getWhatsappConfigApi();
      return await api.getWhatsappConfigurationsByWorkflowId(workflowId);
    },
    enabled: !!workflowId,
  });
}

export function useWhatsappConfigSubscriptions() {
    const { subscribe } = useEvents();
    const queryClient = useQueryClient();

    useEffect(() => {
        subscribe(ENDPOINT_EVENTS.WHATSAPP_CONFIG_STREAM, TYPE_EVENTS.WHATSAPP_CONFIG_UPDATED, (data: WhatsAppConfig) => {
            queryClient.invalidateQueries({ queryKey: ['whatsapp', 'list'] });
        });
        
    }, [subscribe, queryClient]);
}