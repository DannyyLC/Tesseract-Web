import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import RootApi from '@/lib/api/endpoints/root-api';
import { SubscriptionPlan } from '@tesseract/types';
import { CreateCreditCheckoutParams } from '@/lib/api/endpoints/billing/billing-api';

// Hook para obtener los planes de suscripción
export function usePlans() {
  return useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: async () => {
      const api = RootApi.getInstance().getBillingApi();
      return await api.getPlans();
    },
    // Cinco minutos, en línea con la caché del gateway: los precios salen de Stripe y un
    // cambio debe verse pronto, pero no hace falta consultarlo en cada navegación.
    staleTime: 1000 * 60 * 5,
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
export function useBillingDashboard({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['billing', 'dashboard'],
    queryFn: async () => {
      const api = RootApi.getInstance().getBillingApi();
      return await api.getDashboardData();
    },
    enabled,
  });
}

// Hook para mutaciones de facturación
export function useBillingMutations() {
  const queryClient = useQueryClient();

  const createCheckoutSession = useMutation({
    mutationFn: async ({
      plan,
      country,
    }: {
      plan: string | SubscriptionPlan;
      country?: string;
    }) => {
      const api = RootApi.getInstance().getBillingApi();
      return await api.createCheckoutSession(plan, country);
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

  const createCreditCheckoutSession = useMutation({
    mutationFn: async (params: CreateCreditCheckoutParams) => {
      const api = RootApi.getInstance().getBillingApi();
      return await api.createCreditCheckoutSession(params);
    },
    // No invalida aquí: redirige a Stripe. El saldo se refresca al volver, igual que con el
    // checkout de planes (ver el `visibilitychange`/`?topup=` en las páginas de billing).
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

  const resumeSubscription = useMutation({
    mutationFn: async () => {
      const api = RootApi.getInstance().getBillingApi();
      return await api.resumeSubscription();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing', 'subscription'] });
      queryClient.invalidateQueries({ queryKey: ['billing', 'dashboard'] });
    },
  });

  const cancelPendingDowngrade = useMutation({
    mutationFn: async () => {
      const api = RootApi.getInstance().getBillingApi();
      return await api.cancelPendingDowngrade();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing', 'subscription'] });
      queryClient.invalidateQueries({ queryKey: ['billing', 'dashboard'] });
    },
  });

  const toggleOverages = useMutation({
    mutationFn: async ({
      allowOverages,
      overageLimit,
    }: {
      allowOverages: boolean;
      overageLimit?: number;
    }) => {
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
    createCreditCheckoutSession,
    createPortalSession,
    updateSubscription,
    cancelSubscription,
    resumeSubscription,
    cancelPendingDowngrade,
    toggleOverages,
  };
}
