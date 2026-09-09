import RootApi from '@/lib/api/endpoints/root-api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import useEvents from '@/hooks/shared/use-events';
import { WhatsAppConfig, ENDPOINT_EVENTS, TYPE_EVENTS } from '@tesseract/types';
import type {
  CreateTemplateInput,
  UpdateTemplateInput,
} from '@/lib/api/endpoints/messaging/whatsapp-config/whatsapp-config';

export function useWhatsappMutations() {
  const queryClient = useQueryClient();

  const setisActiveStatus = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: boolean }) => {
      const api = RootApi.getInstance().getWhatsappConfigApi();
      return await api.updateIsActiveStatus(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'list'] });
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
    mutationFn: async ({
      workflowId,
      phoneNumber,
    }: {
      workflowId: string;
      phoneNumber: string;
    }) => {
      const api = RootApi.getInstance().getWhatsappConfigApi();
      return await api.addWhatsappConfiguration({ workflowId, phoneNumber });
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'list'] });
    },
  });

  const updateWhatsappConfiguration = useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      displayName?: string;
      description?: string;
      /** Tri-estado: ausente no toca, `null` desasigna, string reasigna. */
      workflowId?: string | null;
      isDefaultForOutbound?: boolean;
    }) => {
      const api = RootApi.getInstance().getWhatsappConfigApi();
      return await api.updateWhatsappConfiguration(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'list'] });
    },
  });

  return {
    setisActiveStatus,
    deleteWhatsappConfig,
    addWhatsappConfiguration,
    updateWhatsappConfiguration,
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

export function useWhatsappTemplates(configId: string | null) {
  return useQuery({
    queryKey: ['whatsapp', 'templates', configId],
    queryFn: async () => {
      const api = RootApi.getInstance().getWhatsappConfigApi();
      return await api.listTemplates(configId!);
    },
    enabled: !!configId,
  });
}

export function useWhatsappTemplateMutations(configId: string) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['whatsapp', 'templates', configId] });

  const createTemplate = useMutation({
    mutationFn: async (data: CreateTemplateInput) => {
      const api = RootApi.getInstance().getWhatsappConfigApi();
      return await api.createTemplate(configId, data);
    },
    onSuccess: invalidate,
  });

  const updateTemplate = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateTemplateInput }) => {
      const api = RootApi.getInstance().getWhatsappConfigApi();
      return await api.updateTemplate(id, data);
    },
    onSuccess: invalidate,
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const api = RootApi.getInstance().getWhatsappConfigApi();
      return await api.deleteTemplate(id);
    },
    onSuccess: invalidate,
  });

  return { createTemplate, updateTemplate, deleteTemplate };
}

export function useWhatsappConfigSubscriptions() {
  const { subscribe } = useEvents();
  const queryClient = useQueryClient();

  useEffect(() => {
    subscribe(
      ENDPOINT_EVENTS.WHATSAPP_CONFIG_STREAM,
      TYPE_EVENTS.WHATSAPP_CONFIG_UPDATED,
      (data: WhatsAppConfig) => {
        queryClient.invalidateQueries({ queryKey: ['whatsapp', 'list'] });
      },
    );
  }, [subscribe, queryClient]);
}
