'use client';

import { useTranslations } from 'next-intl';
import type { AdminOrganizationDetail } from '@/lib/api/endpoints/identity/organizations/organizations-admin-api';
import { CreditsTab } from './credits-tab';
import { SubscriptionTab } from './subscription-tab';

interface Props {
  organizationId: string;
  org: AdminOrganizationDetail;
}

/**
 * Créditos y suscripción en una sola pestaña: la suscripción sola era demasiado poco para
 * ocupar una. Arriba el balance con su sobregiro; debajo la suscripción (de qué plan salen
 * los créditos y hasta cuándo) y al final el historial de movimientos.
 */
export function BillingTab({ organizationId, org }: Props) {
  const t = useTranslations('Admin.SubscriptionTab');
  return (
    <CreditsTab
      organizationId={organizationId}
      org={org}
      afterBalance={
        <section className="rounded-2xl border border-border p-6">
          <h2 className="mb-4 text-base font-semibold text-text-primary">{t('title')}</h2>
          <SubscriptionTab org={org} />
        </section>
      }
    />
  );
}
