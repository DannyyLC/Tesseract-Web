'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { InfiniteSelect } from '@/components/ui/infinite-select';
import { LogoLoader } from '@/components/ui/logo-loader';
import { useDebounce } from '@/hooks/use-debounce';
import {
  useAdminWorkflows,
  useInfiniteAdminOrganizations,
} from '@/hooks/automation/use-admin-workflows';
import type { AdminWorkflowAnalytics } from '@/lib/api/endpoints/billing/analytics-admin-api';
import { filterSelectClass, iconBtn, labelClass } from '@/app/[locale]/admin/_styles';
import {
  AXIS_TICK,
  COMPARE_COLOR,
  ChartCard,
  Legend,
  PRIMARY_COLOR,
  TooltipBox,
  formatCompactNumber,
  formatDay,
  formatDuration,
  formatNullableUSD,
  formatPct,
  formatTokens,
  formatUSD,
} from './shared';

/** Cuántos workflows se listan en el selector; el buscador cubre el resto. */
const WORKFLOW_OPTIONS_LIMIT = 50;

interface Props {
  base: AdminWorkflowAnalytics;
  compareId: string;
  compare: AdminWorkflowAnalytics | undefined;
  isCompareLoading: boolean;
  onSelect: (workflowId: string) => void;
  onClose: () => void;
}

/** Qué lado es mejor para el margen en una fila: menos costo/tokens, o más éxito/margen. */
type Better = 'lower' | 'higher' | null;

interface CompareRow {
  label: string;
  a: number | null;
  b: number | null;
  format: (value: number | null) => string;
  better: Better;
}

/** Ingreso estimado por ejecución cobrada: créditos de la categoría × valor del crédito del plan. */
function revenuePerExecution(data: AdminWorkflowAnalytics): number | null {
  const { estimatedRevenueUSD, charged } = data.kpis;
  return estimatedRevenueUSD != null && charged > 0 ? estimatedRevenueUSD / charged : null;
}

export function CompareSection({
  base,
  compareId,
  compare,
  isCompareLoading,
  onSelect,
  onClose,
}: Props) {
  const t = useTranslations('Admin.WorkflowMetrics.Compare');

  // La organización arranca en la del workflow comparado (si ya hay uno en la URL); si no, vacía.
  const [organizationId, setOrganizationId] = useState(compare?.workflow.organizationId ?? '');
  const effectiveOrgId = organizationId || compare?.workflow.organizationId || '';
  const [orgSearchInput, setOrgSearchInput] = useState('');
  const [workflowSearchInput, setWorkflowSearchInput] = useState('');
  const orgSearch = useDebounce(orgSearchInput, 400);
  const workflowSearch = useDebounce(workflowSearchInput, 400);

  const {
    data: orgPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: orgsLoading,
  } = useInfiniteAdminOrganizations({ search: orgSearch || undefined });

  const orgOptions = useMemo(
    () =>
      (orgPages?.pages.flatMap((p) => p.data) ?? []).map((o) => ({
        label: `${o.name} (${o._count.workflows})`,
        value: o.id,
      })),
    [orgPages],
  );

  const { data: workflowsPage, isLoading: workflowsLoading } = useAdminWorkflows(
    {
      organizationId: effectiveOrgId,
      search: workflowSearch || undefined,
      limit: WORKFLOW_OPTIONS_LIMIT,
    },
    Boolean(effectiveOrgId),
  );

  const workflowOptions = useMemo(
    () =>
      (workflowsPage?.data ?? [])
        .filter((w) => w.id !== base.workflow.id)
        .map((w) => ({ label: `${w.name} · ${w.category}`, value: w.id })),
    [workflowsPage, base.workflow.id],
  );

  return (
    <section className="space-y-6 rounded-2xl border border-[var(--chart-warning)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">{t('title')}</h3>
          <p className="mt-0.5 text-xs text-text-tertiary">{t('subtitle')}</p>
        </div>
        <button className={iconBtn} onClick={onClose} aria-label={t('close')} title={t('close')}>
          <X size={16} />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <span className={labelClass}>{t('organization')}</span>
          <InfiniteSelect
            triggerClassName={filterSelectClass}
            value={effectiveOrgId}
            onChange={(value) => {
              setOrganizationId(value);
              setWorkflowSearchInput('');
            }}
            options={orgOptions}
            placeholder={t('organizationPlaceholder')}
            isLoading={orgsLoading}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            fetchNextPage={fetchNextPage}
            searchValue={orgSearchInput}
            onSearchChange={setOrgSearchInput}
            searchPlaceholder={t('organizationSearch')}
          />
        </div>
        <div>
          <span className={labelClass}>{t('workflow')}</span>
          <InfiniteSelect
            triggerClassName={filterSelectClass}
            value={compareId}
            onChange={onSelect}
            options={workflowOptions}
            placeholder={effectiveOrgId ? t('workflowPlaceholder') : t('pickOrganizationFirst')}
            isLoading={workflowsLoading && Boolean(effectiveOrgId)}
            searchValue={workflowSearchInput}
            onSearchChange={setWorkflowSearchInput}
            searchPlaceholder={t('workflowSearch')}
          />
        </div>
      </div>

      {!compareId ? (
        <p className="py-6 text-center text-sm text-text-tertiary">{t('pickWorkflow')}</p>
      ) : isCompareLoading || !compare ? (
        <div className="flex justify-center py-10">
          <LogoLoader text={t('loading')} />
        </div>
      ) : (
        <CompareContent base={base} compare={compare} />
      )}
    </section>
  );
}

function CompareContent({
  base,
  compare,
}: {
  base: AdminWorkflowAnalytics;
  compare: AdminWorkflowAnalytics;
}) {
  const t = useTranslations('Admin.WorkflowMetrics.Compare');
  const nameA = base.workflow.name;
  const nameB = compare.workflow.name;

  const rows: CompareRow[] = [
    {
      label: t('rows.executions'),
      a: base.kpis.executions,
      b: compare.kpis.executions,
      format: (v) => (v == null ? '—' : formatCompactNumber(v)),
      better: null,
    },
    {
      label: t('rows.successRate'),
      a: base.kpis.successRate,
      b: compare.kpis.successRate,
      format: formatPct,
      better: 'higher',
    },
    {
      label: t('rows.revenuePerExecution'),
      a: revenuePerExecution(base),
      b: revenuePerExecution(compare),
      format: formatNullableUSD,
      better: 'higher',
    },
    {
      label: t('rows.costAvg'),
      a: base.kpis.costPerExecution.avg,
      b: compare.kpis.costPerExecution.avg,
      format: formatNullableUSD,
      better: 'lower',
    },
    {
      label: t('rows.costP50'),
      a: base.kpis.costPerExecution.p50,
      b: compare.kpis.costPerExecution.p50,
      format: formatNullableUSD,
      better: 'lower',
    },
    {
      label: t('rows.costP95'),
      a: base.kpis.costPerExecution.p95,
      b: compare.kpis.costPerExecution.p95,
      format: formatNullableUSD,
      better: 'lower',
    },
    {
      label: t('rows.marginPct'),
      a: base.kpis.marginPct,
      b: compare.kpis.marginPct,
      format: formatPct,
      better: 'higher',
    },
    {
      label: t('rows.inputAvg'),
      a: base.kpis.inputTokens.avg,
      b: compare.kpis.inputTokens.avg,
      format: formatTokens,
      better: 'lower',
    },
    {
      label: t('rows.inputP95'),
      a: base.kpis.inputTokens.p95,
      b: compare.kpis.inputTokens.p95,
      format: formatTokens,
      better: 'lower',
    },
    {
      label: t('rows.outputAvg'),
      a: base.kpis.outputTokens.avg,
      b: compare.kpis.outputTokens.avg,
      format: formatTokens,
      better: 'lower',
    },
    {
      label: t('rows.ratio'),
      a: base.kpis.inputOutputRatio,
      b: compare.kpis.inputOutputRatio,
      format: (v) => (v == null ? '—' : `${v.toFixed(1)} : 1`),
      better: null,
    },
    {
      label: t('rows.durationP50'),
      a: base.kpis.durationMs.p50,
      b: compare.kpis.durationMs.p50,
      format: formatDuration,
      better: 'lower',
    },
  ];

  // Misma ventana y misma zona en los dos lados: las fechas coinciden una a una.
  const compareByDate = new Map(compare.timeseries.map((p) => [p.date, p]));
  const dailyCost = base.timeseries.map((p) => ({
    date: p.date,
    a: p.avgCostUSD,
    b: compareByDate.get(p.date)?.avgCostUSD ?? null,
  }));

  const tokens = [
    { name: t('input'), a: base.kpis.inputTokens.avg, b: compare.kpis.inputTokens.avg },
    { name: t('output'), a: base.kpis.outputTokens.avg, b: compare.kpis.outputTokens.avg },
  ];

  // Costo por ejecución de cada modelo (no el total): el volumen de cada workflow es distinto y
  // el total solo diría cuál se usó más.
  const models = Array.from(
    new Set([...base.byModel.map((m) => m.model), ...compare.byModel.map((m) => m.model)]),
  ).map((model) => {
    const perExecution = (data: AdminWorkflowAnalytics) => {
      const row = data.byModel.find((m) => m.model === model);
      return row && data.kpis.charged > 0 ? row.costUSD / data.kpis.charged : 0;
    };
    return { model, a: perExecution(base), b: perExecution(compare) };
  });

  const legend = (
    <Legend
      items={[
        { label: nameA, color: PRIMARY_COLOR },
        { label: nameB, color: COMPARE_COLOR },
      ]}
    />
  );

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-text-secondary">
              <th className="p-3 font-semibold">{t('metric')}</th>
              <th className="p-3 text-right font-semibold">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: PRIMARY_COLOR }} />
                  {nameA}
                </span>
              </th>
              <th className="p-3 text-right font-semibold">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: COMPARE_COLOR }} />
                  {nameB}
                </span>
              </th>
              <th className="p-3 text-right font-semibold">{t('difference')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <ContextRow
              label={t('rows.organization')}
              a={base.workflow.organizationName}
              b={compare.workflow.organizationName}
            />
            <ContextRow
              label={t('rows.category')}
              a={base.workflow.category}
              b={compare.workflow.category}
            />
            <ContextRow label={t('rows.plan')} a={base.workflow.plan} b={compare.workflow.plan} />
            <ContextRow
              label={t('rows.creditValue')}
              a={formatNullableUSD(base.workflow.creditValueUSD)}
              b={formatNullableUSD(compare.workflow.creditValueUSD)}
            />
            {rows.map((row) => (
              <MetricRow key={row.label} row={row} />
            ))}
          </tbody>
        </table>
        <p className="border-t border-border px-3 py-2 text-xs text-text-tertiary">
          {t('differenceHint', { name: nameA })}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title={t('dailyCostTitle')} subtitle={t('dailyCostSubtitle')} legend={legend}>
          <ResponsiveContainer width="100%" height={260} minWidth={0}>
            <LineChart data={dailyCost} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={AXIS_TICK}
                tickMargin={10}
                minTickGap={30}
                interval="preserveStartEnd"
                tickFormatter={formatDay}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={AXIS_TICK}
                tickFormatter={(v) => formatUSD(Number(v))}
                width={70}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as (typeof dailyCost)[number];
                  return (
                    <TooltipBox
                      title={formatDay(String(label))}
                      rows={[
                        { label: nameA, value: formatNullableUSD(p.a), color: PRIMARY_COLOR },
                        { label: nameB, value: formatNullableUSD(p.b), color: COMPARE_COLOR },
                      ]}
                    />
                  );
                }}
              />
              <Line
                type="monotone"
                dataKey="a"
                stroke={PRIMARY_COLOR}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="b"
                stroke={COMPARE_COLOR}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t('tokensTitle')} subtitle={t('tokensSubtitle')} legend={legend}>
          <ResponsiveContainer width="100%" height={260} minWidth={0}>
            <BarChart data={tokens} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={AXIS_TICK}
                tickMargin={10}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={AXIS_TICK}
                tickFormatter={(v) => formatTokens(Number(v))}
                width={45}
              />
              <Tooltip
                cursor={{ fill: 'var(--surface-tint)' }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as (typeof tokens)[number];
                  return (
                    <TooltipBox
                      title={String(label)}
                      rows={[
                        { label: nameA, value: formatTokens(p.a), color: PRIMARY_COLOR },
                        { label: nameB, value: formatTokens(p.b), color: COMPARE_COLOR },
                      ]}
                    />
                  );
                }}
              />
              <Bar dataKey="a" fill={PRIMARY_COLOR} radius={[4, 4, 0, 0]} />
              <Bar dataKey="b" fill={COMPARE_COLOR} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard
        title={t('modelsTitle')}
        subtitle={t('modelsSubtitle')}
        legend={legend}
        isEmpty={models.length === 0}
        emptyText={t('noModels')}
      >
        <ResponsiveContainer width="100%" height={Math.max(140, models.length * 56)} minWidth={0}>
          <BarChart
            data={models}
            layout="vertical"
            margin={{ top: 0, right: 10, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} strokeOpacity={0.1} />
            <XAxis
              type="number"
              axisLine={false}
              tickLine={false}
              tick={AXIS_TICK}
              tickFormatter={(v) => formatUSD(Number(v))}
            />
            <YAxis
              type="category"
              dataKey="model"
              axisLine={false}
              tickLine={false}
              tick={AXIS_TICK}
              width={110}
            />
            <Tooltip
              cursor={{ fill: 'var(--surface-tint)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as (typeof models)[number];
                return (
                  <TooltipBox
                    title={p.model}
                    rows={[
                      { label: nameA, value: formatUSD(p.a), color: PRIMARY_COLOR },
                      { label: nameB, value: formatUSD(p.b), color: COMPARE_COLOR },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="a" fill={PRIMARY_COLOR} radius={[0, 4, 4, 0]} />
            <Bar dataKey="b" fill={COMPARE_COLOR} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function ContextRow({ label, a, b }: { label: string; a: string; b: string }) {
  return (
    <tr>
      <td className="p-3 text-text-secondary">{label}</td>
      <td className="p-3 text-right text-text-primary">{a}</td>
      <td className="p-3 text-right text-text-primary">{b}</td>
      <td className="p-3" />
    </tr>
  );
}

/**
 * La diferencia es del comparado respecto a este workflow. El valor que favorece al margen va en
 * verde; las filas sin "mejor" (volumen, proporción) se quedan neutras.
 */
function MetricRow({ row }: { row: CompareRow }) {
  const { a, b } = row;
  const diffPct = a != null && b != null && a !== 0 ? ((b - a) / Math.abs(a)) * 100 : null;
  const winner =
    row.better && a != null && b != null && a !== b
      ? (row.better === 'lower' ? a < b : a > b)
        ? 'a'
        : 'b'
      : null;
  const winClass = 'font-semibold text-[var(--success-text-adaptive)]';

  return (
    <tr>
      <td className="p-3 text-text-secondary">{row.label}</td>
      <td className={`p-3 text-right ${winner === 'a' ? winClass : 'text-text-primary'}`}>
        {row.format(a)}
      </td>
      <td className={`p-3 text-right ${winner === 'b' ? winClass : 'text-text-primary'}`}>
        {row.format(b)}
      </td>
      <td className="p-3 text-right text-text-tertiary">
        {diffPct == null ? '—' : `${diffPct > 0 ? '+' : ''}${diffPct.toFixed(1)}%`}
      </td>
    </tr>
  );
}
