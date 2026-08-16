'use client';

import { ArrowRight, Loader2 } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { useAdminOrganization } from '@/hooks/identity/use-admin-organizations';

interface Props {
  organizationId: string;
}

/**
 * Resumen de una organización dentro de su fila expandida en el listado. Mismos datos que
 * la pestaña General/Suscripción del detalle, pero de solo lectura — para editar (créditos,
 * límites, suscripción) hay que entrar a la organización completa.
 */
export function OrganizationSummary({ organizationId }: Props) {
  const { data: org, isLoading, error } = useAdminOrganization(organizationId);

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 size={18} className="animate-spin text-text-tertiary" />
      </div>
    );
  }

  if (error || !org) {
    return (
      <p className="py-4 text-center text-sm text-danger">No se pudo cargar la organización.</p>
    );
  }

  const limits = org.planLimits.limits;
  const fmt = (max: number) => (max === -1 ? '∞' : max);

  return (
    <div className="space-y-4 py-4">
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-xs text-text-secondary">Plan</dt>
          <dd className="text-sm text-text-primary">{org.plan}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-secondary">Creada</dt>
          <dd className="text-sm text-text-primary">
            {new Date(org.createdAt).toLocaleDateString('es-MX')}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-secondary">Créditos</dt>
          <dd className="text-sm text-text-primary">{org.usage.credits}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-secondary">Se renuevan</dt>
          <dd className="text-sm text-text-primary">
            {org.subscription
              ? new Date(org.subscription.currentPeriodEnd).toLocaleDateString('es-MX')
              : '—'}
          </dd>
        </div>
      </dl>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <dt className="text-xs text-text-secondary">Workflows</dt>
          <dd className="text-sm text-text-primary">
            {org.usage.workflows} / {fmt(limits.maxWorkflows)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-secondary">Usuarios</dt>
          <dd className="text-sm text-text-primary">
            {org.usage.users} / {fmt(limits.maxUsers)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-secondary">API keys</dt>
          <dd className="text-sm text-text-primary">
            {org.usage.apiKeys} / {fmt(limits.maxApiKeys)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-secondary">Datasets</dt>
          <dd className="text-sm text-text-primary">
            {org.usage.datasets} / {fmt(limits.maxDatasets)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-secondary">Filas de datasets</dt>
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
          Ver organización completa
          <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}
