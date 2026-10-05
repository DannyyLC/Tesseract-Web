'use client';

import { useTranslations } from 'next-intl';
import { useAdminTenantToolsOverview } from '@/hooks/automation/use-admin-tenant-tools';
import type { AdminTenantToolSegment } from '@/lib/api/endpoints/automation/tools/tenant-tools-admin-api';
import { OverviewCard, OverviewCardsSkeleton } from '@/components/admin/overview-card';

interface Props {
  segment: AdminTenantToolSegment | null;
  onSegmentChange: (segment: AdminTenantToolSegment | null) => void;
}

/**
 * Arriba del listado de integraciones: cuántas funcionan, cuáles fallan (y por qué), cuáles
 * están conectadas sin que nada las use, y la herramienta más popular. Las tres primeras
 * filtran el listado.
 */
export function TenantToolsOverviewCards({ segment, onSegmentChange }: Props) {
  const t = useTranslations('Admin.Integrations.Overview');
  const { data } = useAdminTenantToolsOverview();

  if (!data) return <OverviewCardsSkeleton />;

  const toggle = (next: AdminTenantToolSegment) => onSegmentChange(segment === next ? null : next);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <OverviewCard
        label={t('connectedTitle')}
        value={String(data.connected)}
        active={segment === 'connected'}
        onClick={() => toggle('connected')}
        hint={t('connectedHint', { total: data.total, orgs: data.connectedOrganizations })}
      />
      <OverviewCard
        label={t('problemTitle')}
        color={data.problem > 0 ? 'var(--danger-500)' : 'var(--success-500)'}
        value={String(data.problem)}
        active={segment === 'problem'}
        onClick={() => toggle('problem')}
        hint={
          data.problem > 0
            ? t('problemHint', { expired: data.expiredAuth, error: data.error })
            : t('problemNone')
        }
      />
      <OverviewCard
        label={t('unattachedTitle')}
        color={data.unattached > 0 ? 'var(--warning-500)' : undefined}
        value={String(data.unattached)}
        active={segment === 'unattached'}
        onClick={() => toggle('unattached')}
        hint={data.unattached > 0 ? t('unattachedHint') : t('unattachedNone')}
      />
      <OverviewCard
        label={t('mostUsedTitle')}
        textValue
        value={data.mostUsed?.name ?? '—'}
        hint={
          data.mostUsed
            ? t('mostUsedHint', { count: data.mostUsed.count, catalogs: data.catalogsInUse })
            : t('mostUsedNone')
        }
      />
    </div>
  );
}
