'use client';

import { AlertTriangle, ArrowUpRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import {
  useInfiniteTenantToolsDashboard,
  flattenTenantTools,
} from '@/hooks/automation/use-tenant-tools';
import PermissionGuard from '@/components/auth/permission-guard';

/**
 * Aviso de integraciones sin acceso.
 *
 * Nadie vive en /integrations, así que un badge dentro de una pestaña de una
 * página secundaria no es un aviso: es un archivo. Esto se cuelga donde el
 * usuario sí entra y desaparece por completo cuando todo está sano — el estado
 * bueno no debe pedir atención.
 */
export function BrokenIntegrationsBanner() {
  const t = useTranslations('Integrations');
  const { data } = useInfiniteTenantToolsDashboard({ pageSize: 50 });

  const broken = flattenTenantTools(data).filter(
    (tool) => tool.status === 'EXPIRED_AUTH' || tool.status === 'ERROR',
  );

  if (broken.length === 0) return null;

  const names = broken.map((tool) => tool.displayName).join(', ');

  return (
    <PermissionGuard permissions="tenant_tools:read">
      <div className="flex items-start gap-3 rounded-xl border border-[var(--danger-banner-border)] bg-[var(--danger-banner-bg)] p-4">
        <AlertTriangle
          size={18}
          className="mt-0.5 flex-shrink-0 text-[var(--danger-text-adaptive)]"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--badge-danger-text-solid)]">
            {t('brokenBannerTitle', { count: broken.length })}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--danger-text-adaptive)]">
            {t('brokenBannerDesc', { names })}
          </p>
        </div>
        <Link
          href="/integrations"
          className="flex flex-shrink-0 items-center gap-1 self-center text-xs font-medium text-[var(--danger-text-adaptive)] hover:underline"
        >
          {t('brokenBannerCta')}
          <ArrowUpRight size={13} />
        </Link>
      </div>
    </PermissionGuard>
  );
}
