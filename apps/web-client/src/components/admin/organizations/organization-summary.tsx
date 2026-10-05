'use client';

import { ArrowRight, Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { useAdminOrganization } from '@/hooks/identity/use-admin-organizations';
import { toIntlLocale } from '@/lib/intl-locale';
import { CreditsCard, UsageGrid, daysUntil, planColor } from './org-visuals';

interface Props {
  organizationId: string;
}

/**
 * Resumen de una organización dentro de su fila expandida en el listado. Mismos datos que
 * la pestaña General/Suscripción del detalle, pero de solo lectura — para editar (créditos,
 * límites, suscripción) hay que entrar a la organización completa.
 */
export function OrganizationSummary({ organizationId }: Props) {
  const t = useTranslations('Admin.OrganizationSummary');
  const intlLocale = toIntlLocale(useLocale());
  const { data: org, isLoading, error } = useAdminOrganization(organizationId);

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 size={18} className="animate-spin text-text-tertiary" />
      </div>
    );
  }

  if (error || !org) {
    return <p className="py-4 text-center text-sm text-danger">{t('loadError')}</p>;
  }

  const date = (value: string) => new Date(value).toLocaleDateString(intlLocale);

  return (
    <div className="space-y-4 py-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        <span className="font-semibold tracking-wide" style={{ color: planColor(org.plan) }}>
          {org.plan}
        </span>
        <span className="text-text-secondary">{t('createdOn', { date: date(org.createdAt) })}</span>
        <span className="text-text-secondary">
          {org.subscription
            ? t('renewsOn', {
                date: date(org.subscription.currentPeriodEnd),
                days: daysUntil(org.subscription.currentPeriodEnd),
              })
            : t('noSubscription')}
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <CreditsCard org={org} bordered={false} />
        <UsageGrid org={org} showIcons={false} />
      </div>

      <div className="pt-1">
        <Link
          href={`/admin/organizaciones/${organizationId}`}
          className="group inline-flex items-center gap-1 text-sm text-text-secondary transition-colors hover:text-text-primary"
        >
          {t('viewFull')}
          <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}
