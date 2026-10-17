'use client';

import { useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { GitCompareArrows } from 'lucide-react';
import { usePathname, useRouter } from '@/i18n/routing';
import { LogoLoader } from '@/components/ui/logo-loader';
import { useAdminWorkflowAnalytics } from '@/hooks/billing/use-admin-analytics';
import {
  btnGhost,
  dangerBannerClass,
  noteClass,
  segmentedItemClass,
  segmentedTrackClass,
} from '@/app/[locale]/admin/_styles';
import { WorkflowKpis } from './workflow-kpis';
import { CostTimeseriesChart } from './cost-timeseries-chart';
import { TokensTimeseriesChart } from './tokens-timeseries-chart';
import { ByModelChart } from './by-model-chart';
import { CostDistributionChart } from './cost-distribution-chart';
import { TopExecutionsTable } from './top-executions-table';
import { CompareSection } from './compare-section';

const PERIOD_VALUES = ['24h', '7d', '30d', '90d', 'all'] as const;
const DEFAULT_PERIOD = '30d';

/**
 * Métricas de costo, tokens y margen de un workflow, para el super admin.
 *
 * El periodo y la comparación viven en la URL (`?period=`, `?compare=`), como la pestaña: así
 * sobreviven a un refresh y un enlace abre exactamente la misma vista. `?compare=` vacío
 * significa "sección abierta, todavía sin workflow elegido"; sin el parámetro, la sección no se
 * monta y solo se ve este workflow.
 */
export function MetricsTab({ workflowId }: { workflowId: string }) {
  const t = useTranslations('Admin.WorkflowMetrics');
  const tPeriods = useTranslations('Admin.Dashboard.periods');
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const periodParam = searchParams.get('period');
  const period = PERIOD_VALUES.some((p) => p === periodParam)
    ? (periodParam as string)
    : DEFAULT_PERIOD;
  const isComparing = searchParams.has('compare');
  const compareId = searchParams.get('compare') ?? '';

  const updateQuery = useCallback(
    (mutate: (query: URLSearchParams) => void) => {
      const query = new URLSearchParams(searchParams.toString());
      mutate(query);
      router.replace(`${pathname}?${query.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const { data, isLoading, error } = useAdminWorkflowAnalytics(workflowId, period);
  const { data: compareData, isLoading: isCompareLoading } = useAdminWorkflowAnalytics(
    isComparing && compareId ? compareId : null,
    period,
  );

  const periods = [
    { value: '24h', label: tPeriods('today') },
    { value: '7d', label: tPeriods('d7') },
    { value: '30d', label: tPeriods('d30') },
    { value: '90d', label: tPeriods('d90') },
    { value: 'all', label: tPeriods('all') },
  ];

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={segmentedTrackClass}>
          {periods.map((p) => (
            <button
              key={p.value}
              onClick={() => updateQuery((q) => q.set('period', p.value))}
              className={segmentedItemClass(period === p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
        {!isComparing && (
          <button className={btnGhost} onClick={() => updateQuery((q) => q.set('compare', ''))}>
            <GitCompareArrows size={16} />
            {t('compare')}
          </button>
        )}
      </div>

      <p className={noteClass}>{t('caveats')}</p>

      {isLoading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <LogoLoader text={t('loading')} />
        </div>
      ) : error || !data ? (
        <div className={dangerBannerClass}>{t('loadError')}</div>
      ) : (
        <>
          {isComparing && (
            <CompareSection
              base={data}
              compareId={compareId}
              compare={compareData}
              isCompareLoading={isCompareLoading}
              onSelect={(id) => updateQuery((q) => q.set('compare', id))}
              onClose={() => updateQuery((q) => q.delete('compare'))}
            />
          )}

          <WorkflowKpis kpis={data.kpis} />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <CostTimeseriesChart points={data.timeseries} />
            <TokensTimeseriesChart points={data.timeseries} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ByModelChart rows={data.byModel} />
            <CostDistributionChart
              buckets={data.costDistribution}
              costPerExecution={data.kpis.costPerExecution}
            />
          </div>

          <TopExecutionsTable items={data.topExecutions} timezone={data.timezone} />
        </>
      )}
    </div>
  );
}
