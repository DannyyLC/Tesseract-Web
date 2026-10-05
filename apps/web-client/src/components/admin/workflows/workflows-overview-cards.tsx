'use client';

import { Moon, TrendingDown, Workflow, XCircle } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toIntlLocale } from '@/lib/intl-locale';
import { useAdminWorkflowsOverview } from '@/hooks/automation/use-admin-workflows';
import type { AdminWorkflowSegment } from '@/lib/api/endpoints/automation/workflows/workflows-admin-api';
import { OverviewCard, OverviewCardsSkeleton } from '@/components/admin/overview-card';

interface Props {
  segment: AdminWorkflowSegment | null;
  onSegmentChange: (segment: AdminWorkflowSegment | null) => void;
}

/**
 * Cuatro números arriba del listado de workflows, cada uno con una acción detrás: al hacer clic
 * filtra el listado a esos workflows. La primera quita el filtro.
 */
export function WorkflowsOverviewCards({ segment, onSegmentChange }: Props) {
  const t = useTranslations('Admin.Workflows.Overview');
  const intlLocale = toIntlLocale(useLocale());
  const { data } = useAdminWorkflowsOverview();

  if (!data) return <OverviewCardsSkeleton />;

  const num = (value: number) => value.toLocaleString(intlLocale);
  const usd = (value: number) =>
    new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: value < 10 ? 2 : 0,
    }).format(value);
  const toggle = (next: AdminWorkflowSegment) => onSegmentChange(segment === next ? null : next);

  const { workflows, failing, negativeMargin, idle } = data;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <OverviewCard
        icon={Workflow}
        label={t('activeTitle')}
        value={num(workflows.active)}
        active={segment === null}
        onClick={() => onSegmentChange(null)}
        hint={t('activeHint', {
          paused: workflows.paused,
          inactive: workflows.inactive,
          internal: workflows.internal,
        })}
      />

      <OverviewCard
        icon={XCircle}
        label={t('failingTitle', { days: failing.days })}
        color={failing.total > 0 ? 'var(--danger-500)' : 'var(--success-500)'}
        value={num(failing.total)}
        active={segment === 'failing'}
        onClick={() => toggle('failing')}
        hint={
          failing.total > 0
            ? t('failingHint', {
                failed: failing.failedExecutions,
                pct: failing.thresholdPct,
              })
            : t('failingNone')
        }
      />

      <OverviewCard
        icon={TrendingDown}
        label={t('negativeMarginTitle', { days: negativeMargin.days })}
        color={negativeMargin.total > 0 ? 'var(--danger-500)' : 'var(--success-500)'}
        value={num(negativeMargin.total)}
        active={segment === 'negativeMargin'}
        onClick={() => toggle('negativeMargin')}
        hint={
          negativeMargin.total > 0
            ? t('negativeMarginHint', {
                loss: usd(negativeMargin.lossUSD),
                days: negativeMargin.days,
              })
            : t('negativeMarginNone')
        }
      />

      <OverviewCard
        icon={Moon}
        label={t('idleTitle', { days: idle.days })}
        color={idle.total > 0 ? 'var(--warning-500)' : 'var(--success-500)'}
        value={num(idle.total)}
        active={segment === 'idle'}
        onClick={() => toggle('idle')}
        hint={idle.total > 0 ? t('idleHint', { days: idle.days }) : t('idleNone')}
      />
    </div>
  );
}
