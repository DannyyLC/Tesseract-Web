'use client';

import { useTranslations } from 'next-intl';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AdminWorkflowAnalyticsModelRow } from '@/lib/api/endpoints/billing/analytics-admin-api';
import { chipClass } from '@/app/[locale]/admin/_styles';
import {
  AXIS_TICK,
  ChartCard,
  PRIMARY_COLOR,
  TooltipBox,
  formatPct,
  formatTokens,
  formatUSD,
} from './shared';

/** Qué modelo se lleva el costo del workflow, con sus tokens. */
export function ByModelChart({ rows }: { rows: AdminWorkflowAnalyticsModelRow[] }) {
  const t = useTranslations('Admin.WorkflowMetrics.ModelChart');
  const chartHeight = Math.max(120, rows.length * 44);

  return (
    <ChartCard
      title={t('title')}
      subtitle={t('subtitle')}
      isEmpty={rows.length === 0}
      emptyText={t('noData')}
    >
      <ResponsiveContainer width="100%" height={chartHeight} minWidth={0}>
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
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
              const row = payload[0].payload as AdminWorkflowAnalyticsModelRow;
              return (
                <TooltipBox
                  title={row.model}
                  rows={[
                    {
                      label: t('cost'),
                      value: `${formatUSD(row.costUSD)} (${formatPct(row.costSharePct)})`,
                    },
                    { label: t('input'), value: formatTokens(row.inputTokens) },
                    { label: t('output'), value: formatTokens(row.outputTokens) },
                  ]}
                />
              );
            }}
          />
          <Bar
            dataKey="costUSD"
            fill={PRIMARY_COLOR}
            radius={[0, 4, 4, 0]}
            animationDuration={800}
          />
        </BarChart>
      </ResponsiveContainer>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-text-secondary">
              <th className="py-2 pr-3 font-semibold">{t('model')}</th>
              <th className="py-2 pr-3 text-right font-semibold">{t('executions')}</th>
              <th className="py-2 pr-3 text-right font-semibold">{t('input')}</th>
              <th className="py-2 pr-3 text-right font-semibold">{t('output')}</th>
              <th className="py-2 text-right font-semibold">{t('cost')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.model}>
                <td className="py-2 pr-3 text-text-primary">
                  <span className="inline-flex items-center gap-2">
                    {row.model}
                    {row.estimated && (
                      <span className={chipClass} title={t('estimatedHint')}>
                        {t('estimated')}
                      </span>
                    )}
                  </span>
                </td>
                <td className="py-2 pr-3 text-right text-text-secondary">{row.executions}</td>
                <td className="py-2 pr-3 text-right text-text-secondary">
                  {formatTokens(row.inputTokens)}
                </td>
                <td className="py-2 pr-3 text-right text-text-secondary">
                  {formatTokens(row.outputTokens)}
                </td>
                <td className="py-2 text-right font-medium text-text-primary">
                  {formatUSD(row.costUSD)}{' '}
                  <span className="text-xs font-normal text-text-tertiary">
                    {formatPct(row.costSharePct)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}
