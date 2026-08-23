'use client';

import { useState } from 'react';
import { LogoLoader } from '@/components/ui/logo-loader';
import {
  useAdminAnalyticsOrganizationsMargin,
  useAdminAnalyticsOverview,
  useAdminAnalyticsTimeseries,
  useAdminAnalyticsTopWorkflows,
} from '@/hooks/billing/use-admin-analytics';
import { KpiCards } from './_components/kpi-cards';
import { CategoryComparisonChart } from './_components/category-comparison-chart';
import { CostExecutionsTimeseriesChart } from './_components/cost-executions-timeseries-chart';
import { TopWorkflowsTable } from './_components/top-workflows-table';
import { OrganizationsMarginTable } from './_components/organizations-margin-table';

const PERIODS = [
  { label: 'Hoy', value: '24h' },
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
  { label: '90d', value: '90d' },
  { label: 'Todo', value: 'all' },
];

const MARGIN_PAGE_SIZE = 10;

export default function AdminDashboardPage() {
  const [period, setPeriod] = useState('30d');
  const [topWorkflowsMetric, setTopWorkflowsMetric] = useState<'cost' | 'executions'>('cost');
  const [marginPage, setMarginPage] = useState(1);

  const { data: overview, isLoading: isOverviewLoading } = useAdminAnalyticsOverview(period);
  const { data: timeseries, isLoading: isTimeseriesLoading } = useAdminAnalyticsTimeseries(period);
  const { data: topWorkflows, isLoading: isTopWorkflowsLoading } = useAdminAnalyticsTopWorkflows(
    period,
    topWorkflowsMetric,
    10,
  );
  const { data: orgsMargin, isLoading: isOrgsMarginLoading } = useAdminAnalyticsOrganizationsMargin(
    period,
    marginPage,
    MARGIN_PAGE_SIZE,
    'marginPct',
  );

  const handlePeriodChange = (next: string) => {
    setPeriod(next);
    setMarginPage(1);
  };

  const isInitialLoading = isOverviewLoading && !overview;

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold text-text-primary">Dashboard</h1>
          <p className="text-xs text-text-secondary">
            Costo real de ejecutar workflows vs. lo que se cobra en créditos, y salud general de la
            plataforma.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-surface-secondary p-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => handlePeriodChange(p.value)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                period === p.value
                  ? 'bg-surface text-text-primary shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isInitialLoading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <LogoLoader text="Cargando dashboard" />
        </div>
      ) : (
        <>
          {overview && <KpiCards kpis={overview.kpis} />}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {overview && <CategoryComparisonChart rows={overview.byCategory} />}
            {timeseries && !isTimeseriesLoading && <CostExecutionsTimeseriesChart points={timeseries.points} />}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {topWorkflows && !isTopWorkflowsLoading && (
              <TopWorkflowsTable
                items={topWorkflows.items}
                metric={topWorkflowsMetric}
                onMetricChange={setTopWorkflowsMetric}
              />
            )}
            {orgsMargin && !isOrgsMarginLoading && (
              <OrganizationsMarginTable
                items={orgsMargin.items}
                page={orgsMargin.page}
                totalPages={Math.max(1, Math.ceil(orgsMargin.total / orgsMargin.limit))}
                onPageChange={setMarginPage}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
