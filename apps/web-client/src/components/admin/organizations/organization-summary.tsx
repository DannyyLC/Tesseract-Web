'use client';

import { ArrowRight, Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { useAdminOrganization } from '@/hooks/identity/use-admin-organizations';
import { toIntlLocale } from '@/lib/intl-locale';

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

  const limits = org.planLimits.limits;
  const fmt = (max: number) => (max === -1 ? '∞' : max.toLocaleString(intlLocale));

  return (
    <div className="space-y-4 py-4">
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-xs text-text-secondary">{t('plan')}</dt>
          <dd className="text-sm text-text-primary">{org.plan}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-secondary">{t('created')}</dt>
          <dd className="text-sm text-text-primary">
            {new Date(org.createdAt).toLocaleDateString(intlLocale)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-secondary">{t('credits')}</dt>
          <dd className={`text-sm ${org.usage.credits < 0 ? 'text-danger' : 'text-text-primary'}`}>
            {org.usage.credits.toLocaleString(intlLocale)} / {fmt(limits.monthlyCredits)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-secondary">{t('renews')}</dt>
          <dd className="text-sm text-text-primary">
            {org.subscription
              ? new Date(org.subscription.currentPeriodEnd).toLocaleDateString(intlLocale)
              : '—'}
          </dd>
        </div>
      </dl>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <dt className="text-xs text-text-secondary">{t('workflows')}</dt>
          <dd className="text-sm text-text-primary">
            {org.usage.workflows} / {fmt(limits.maxWorkflows)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-secondary">{t('users')}</dt>
          <dd className="text-sm text-text-primary">
            {org.usage.users} / {fmt(limits.maxUsers)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-secondary">{t('apiKeys')}</dt>
          <dd className="text-sm text-text-primary">
            {org.usage.apiKeys} / {fmt(limits.maxApiKeys)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-secondary">{t('datasets')}</dt>
          <dd className="text-sm text-text-primary">
            {org.usage.datasets} / {fmt(limits.maxDatasets)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-secondary">{t('datasetRows')}</dt>
          <dd className="text-sm text-text-primary">
            {org.usage.datasetRows} / {fmt(limits.maxDatasetRows)}
          </dd>
        </div>
      </dl>

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
