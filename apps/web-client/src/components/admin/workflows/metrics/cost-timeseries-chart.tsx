'use client';

import { useTranslations } from 'next-intl';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AdminWorkflowAnalyticsPoint } from '@/lib/api/endpoints/billing/analytics-admin-api';
import {
  AXIS_TICK,
  ChartCard,
  Legend,
  TooltipBox,
  formatDay,
  formatNullableUSD,
  formatUSD,
} from './shared';

/**
 * Costo real contra lo cobrado por día (eje izquierdo) y costo promedio por ejecución (eje
 * derecho). La separación entre las dos primeras curvas es el margen del día; la tercera dice si
 * un cambio de margen vino de más volumen o de ejecuciones más caras.
 */
export function CostTimeseriesChart({ points }: { points: AdminWorkflowAnalyticsPoint[] }) {
  const t = useTranslations('Admin.WorkflowMetrics.CostChart');
  const hasData = points.some((p) => p.executions > 0);
  const hasRevenue = points.some((p) => p.estimatedRevenueUSD != null);

  return (
    <ChartCard
      title={t('title')}
      subtitle={t('subtitle')}
      isEmpty={!hasData}
      emptyText={t('noData')}
      legend={
        <Legend
          items={[
            { label: t('cost'), color: 'var(--chart-danger)' },
            ...(hasRevenue ? [{ label: t('revenue'), color: 'var(--chart-success)' }] : []),
            { label: t('avgCost'), color: 'var(--chart-execution)', dashed: true },
          ]}
        />
      }
    >
      <ResponsiveContainer width="100%" height={280} minWidth={0}>
        <ComposedChart data={points} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="wfMetricsCost" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--chart-danger)" stopOpacity={0.25} />
              <stop offset="95%" stopColor="var(--chart-danger)" stopOpacity={0} />
            </linearGradient>
          </defs>
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
            yAxisId="total"
            axisLine={false}
            tickLine={false}
            tick={AXIS_TICK}
            tickFormatter={(v) => formatUSD(Number(v))}
            width={60}
          />
          <YAxis
            yAxisId="unit"
            orientation="right"
            axisLine={false}
            tickLine={false}
            tick={AXIS_TICK}
            tickFormatter={(v) => formatUSD(Number(v))}
            width={70}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as AdminWorkflowAnalyticsPoint;
              return (
                <TooltipBox
                  title={formatDay(String(label))}
                  rows={[
                    { label: t('executions'), value: String(p.executions) },
                    { label: t('cost'), value: formatUSD(p.costUSD), color: 'var(--chart-danger)' },
                    ...(hasRevenue
                      ? [
                          {
                            label: t('revenue'),
                            value: formatNullableUSD(p.estimatedRevenueUSD),
                            color: 'var(--chart-success)',
                          },
                        ]
                      : []),
                    {
                      label: t('avgCost'),
                      value: formatNullableUSD(p.avgCostUSD),
                      color: 'var(--chart-execution)',
                    },
                  ]}
                />
              );
            }}
          />
          <Area
            yAxisId="total"
            type="monotone"
            dataKey="costUSD"
            stroke="var(--chart-danger)"
            fill="url(#wfMetricsCost)"
            fillOpacity={1}
            animationDuration={800}
          />
          {hasRevenue && (
            <Line
              yAxisId="total"
              type="monotone"
              dataKey="estimatedRevenueUSD"
              stroke="var(--chart-success)"
              strokeWidth={2}
              dot={false}
              animationDuration={800}
            />
          )}
          <Line
            yAxisId="unit"
            type="monotone"
            dataKey="avgCostUSD"
            stroke="var(--chart-execution)"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
            connectNulls
            animationDuration={800}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
