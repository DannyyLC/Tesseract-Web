'use client';

import { useTranslations } from 'next-intl';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  AdminAnalyticsDistribution,
  AdminWorkflowAnalyticsCostBucket,
} from '@/lib/api/endpoints/billing/analytics-admin-api';
import { AXIS_TICK, ChartCard, Legend, PRIMARY_COLOR, TooltipBox, formatUSD } from './shared';

function bucketLabel(bucket: AdminWorkflowAnalyticsCostBucket): string {
  return bucket.toUSD == null ? `≥ ${formatUSD(bucket.fromUSD)}` : formatUSD(bucket.fromUSD);
}

/** Rango del histograma al que cae un valor, para anclar las líneas de p50 y p95. */
function bucketFor(
  buckets: AdminWorkflowAnalyticsCostBucket[],
  value: number | null,
): string | undefined {
  if (value == null) return undefined;
  const bucket = buckets.find((b) => b.toUSD == null || value < b.toUSD);
  return bucket ? bucketLabel(bucket) : undefined;
}

/**
 * Cuántas ejecuciones caen en cada rango de costo. Una montaña sola es un workflow predecible;
 * una cola larga a la derecha dice que hay conversaciones concretas que se disparan, y esas son
 * las que hay que abrir en "Ejecuciones más caras".
 */
export function CostDistributionChart({
  buckets,
  costPerExecution,
}: {
  buckets: AdminWorkflowAnalyticsCostBucket[];
  costPerExecution: AdminAnalyticsDistribution;
}) {
  const t = useTranslations('Admin.WorkflowMetrics.DistributionChart');
  const data = buckets.map((b) => ({ ...b, label: bucketLabel(b) }));
  const p50 = bucketFor(buckets, costPerExecution.p50);
  const p95 = bucketFor(buckets, costPerExecution.p95);

  return (
    <ChartCard
      title={t('title')}
      subtitle={t('subtitle')}
      isEmpty={buckets.length === 0}
      emptyText={t('noData')}
      legend={
        <Legend
          items={[
            { label: t('p50'), color: 'var(--chart-success)', dashed: true },
            { label: t('p95'), color: 'var(--chart-danger)', dashed: true },
          ]}
        />
      }
    >
      <ResponsiveContainer width="100%" height={280} minWidth={0}>
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={AXIS_TICK}
            tickMargin={10}
            interval="preserveStartEnd"
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={AXIS_TICK}
            allowDecimals={false}
            width={40}
          />
          <Tooltip
            cursor={{ fill: 'var(--surface-tint)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const b = payload[0].payload as AdminWorkflowAnalyticsCostBucket;
              const range =
                b.toUSD == null
                  ? `≥ ${formatUSD(b.fromUSD)}`
                  : `${formatUSD(b.fromUSD)} – ${formatUSD(b.toUSD)}`;
              return (
                <TooltipBox
                  title={range}
                  rows={[{ label: t('executions'), value: String(b.count) }]}
                />
              );
            }}
          />
          <Bar dataKey="count" fill={PRIMARY_COLOR} radius={[4, 4, 0, 0]} animationDuration={800} />
          {p50 && <ReferenceLine x={p50} stroke="var(--chart-success)" strokeDasharray="4 4" />}
          {p95 && <ReferenceLine x={p95} stroke="var(--chart-danger)" strokeDasharray="4 4" />}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
