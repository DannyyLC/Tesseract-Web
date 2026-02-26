import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import RootApi from '@/app/_api_request_manager/_apis/root-api';
import { SubscriptionPlan } from '@tesseract/types';

// Hook para obtener los planes de suscripción
export function usePlans() {
  return useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: async () => {
      const api = RootApi.getInstance().getBillingApi();
      return await api.getPlans();
    },
    staleTime: 1000 * 60 * 60, // 1 hour
  });
}

// Hook para obtener los detalles de la suscripción actual
export function useSubscription() {
  return useQuery({
    queryKey: ['billing', 'subscription'],
    queryFn: async () => {
      const api = RootApi.getInstance().getBillingApi();
      return await api.getSubscription();
    },
  });
}

// Hook para obtener los datos del dashboard de facturación
export function useBillingDashboard() {
  return useQuery({
    queryKey: ['billing', 'dashboard'],
    queryFn: async () => {
      const api = RootApi.getInstance().getBillingApi();
      return await api.getDashboardData();
    },
  });
}

// Hook para mutaciones de facturación
export function useBillingMutations() {
  const queryClient = useQueryClient();

  const createCheckoutSession = useMutation({
    mutationFn: async (plan: string | SubscriptionPlan) => {
      const api = RootApi.getInstance().getBillingApi();
      return await api.createCheckoutSession(plan);
    },
    // No invalidation needed here as it redirects
  });

  const createPortalSession = useMutation({
    mutationFn: async () => {
      const api = RootApi.getInstance().getBillingApi();
      return await api.createPortalSession();
    },
    // No invalidation needed here as it redirects
  });

  const updateSubscription = useMutation({
    mutationFn: async (plan: SubscriptionPlan) => {
      const api = RootApi.getInstance().getBillingApi();
      return await api.updateSubscription(plan);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing', 'subscription'] });
      queryClient.invalidateQueries({ queryKey: ['billing', 'dashboard'] });
    },
  });

  const cancelSubscription = useMutation({
    mutationFn: async () => {
      const api = RootApi.getInstance().getBillingApi();
      return await api.cancelSubscription();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing', 'subscription'] });
      queryClient.invalidateQueries({ queryKey: ['billing', 'dashboard'] });
    },
  });

  const toggleOverages = useMutation({
    mutationFn: async ({ allowOverages, overageLimit }: { allowOverages: boolean; overageLimit?: number }) => {
      const api = RootApi.getInstance().getBillingApi();
      return await api.toggleOverages(allowOverages, overageLimit);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing', 'subscription'] });
      queryClient.invalidateQueries({ queryKey: ['billing', 'dashboard'] });
    },
  });

  return {
    createCheckoutSession,
    createPortalSession,
    updateSubscription,
    cancelSubscription,
    toggleOverages,
  };
}
