'use client';

import { useTranslations } from 'next-intl';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AdminWorkflowAnalyticsPoint } from '@/lib/api/endpoints/billing/analytics-admin-api';
import { AXIS_TICK, ChartCard, Legend, TooltipBox, formatDay, formatTokens } from './shared';

const INPUT_COLOR = 'var(--chart-execution)';
const OUTPUT_COLOR = 'var(--chart-success)';

/**
 * Tokens promedio por ejecución, por día, apilados en entrada y salida. Si la barra crece por
 * la parte de entrada es contexto (historial, prompt, resultados de tools); si crece por la de
 * salida, el modelo está escribiendo más.
 */
export function TokensTimeseriesChart({ points }: { points: AdminWorkflowAnalyticsPoint[] }) {
  const t = useTranslations('Admin.WorkflowMetrics.TokensChart');
  const hasData = points.some((p) => p.avgInputTokens != null || p.avgOutputTokens != null);

  return (
    <ChartCard
      title={t('title')}
      subtitle={t('subtitle')}
      isEmpty={!hasData}
      emptyText={t('noData')}
      legend={
        <Legend
          items={[
            { label: t('input'), color: INPUT_COLOR },
            { label: t('output'), color: OUTPUT_COLOR },
          ]}
        />
      }
    >
      <ResponsiveContainer width="100%" height={280} minWidth={0}>
        <BarChart data={points} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
            tickFormatter={(v) => formatTokens(Number(v))}
            width={45}
          />
          <Tooltip
            cursor={{ fill: 'var(--surface-tint)' }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as AdminWorkflowAnalyticsPoint;
              return (
                <TooltipBox
                  title={formatDay(String(label))}
                  rows={[
                    {
                      label: t('input'),
                      value: formatTokens(p.avgInputTokens),
                      color: INPUT_COLOR,
                    },
                    {
                      label: t('output'),
                      value: formatTokens(p.avgOutputTokens),
                      color: OUTPUT_COLOR,
                    },
                  ]}
                />
              );
            }}
          />
          <Bar
            dataKey="avgInputTokens"
            stackId="tokens"
            fill={INPUT_COLOR}
            animationDuration={800}
          />
          <Bar
            dataKey="avgOutputTokens"
            stackId="tokens"
            fill={OUTPUT_COLOR}
            radius={[4, 4, 0, 0]}
            animationDuration={800}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
