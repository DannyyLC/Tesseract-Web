import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import RootApi from '@/lib/api/endpoints/root-api';
import type { AdjustAdminCreditsInput } from '@/lib/api/endpoints/billing/credits-admin-api';
import type { UpdateAdminSubscriptionInput } from '@/lib/api/endpoints/billing/subscription-admin-api';

const CREDITS_KEY = 'admin-org-credits';

// Balance + historial de créditos de una organización, paginado por cursor
export function useAdminOrgCredits(
  organizationId: string,
  cursor?: string,
  direction?: 'next' | 'prev',
) {
  return useQuery({
    queryKey: [CREDITS_KEY, organizationId, cursor ?? null, direction ?? null],
    queryFn: async () => {
      const api = RootApi.getInstance().getCreditsAdminApi();
      return await api.getDashboard(organizationId, cursor, direction);
    },
    enabled: !!organizationId,
    retry: false,
  });
}

// Ajuste manual de créditos (+/-)
export function useAdjustAdminCredits() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      organizationId,
      data,
    }: {
      organizationId: string;
      data: AdjustAdminCreditsInput;
    }) => {
      const api = RootApi.getInstance().getCreditsAdminApi();
      return await api.adjust(organizationId, data);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [CREDITS_KEY, variables.organizationId] });
    },
  });
}

// Edición manual de la suscripción (solo organizaciones sin Stripe)
export function useUpdateAdminSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      organizationId,
      data,
    }: {
      organizationId: string;
      data: UpdateAdminSubscriptionInput;
    }) => {
      const api = RootApi.getInstance().getSubscriptionAdminApi();
      return await api.update(organizationId, data);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-organizations', 'detail', variables.organizationId] });
    },
  });
}
