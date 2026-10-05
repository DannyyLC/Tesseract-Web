'use client';

import { useLocale, useTranslations } from 'next-intl';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useResponseTime } from '@/hooks/automation/use-executions';
import { toIntlLocale } from '@/lib/intl-locale';
import { ChartSkeleton, SectionTitle } from './dashboard-section';

const AXIS_TICK = { fontSize: 12, fill: 'currentColor', opacity: 0.4 };
const PERIOD = '30d';

/** Milisegundos a segundos legibles: una respuesta del bot se mide en segundos. */
function seconds(ms: number | null | undefined): string {
  if (ms == null) return '—';
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/**
 * Qué tan rápido contesta el bot: la mediana del tiempo en generar cada respuesta a una
 * conversación, su evolución por día y por workflow. No incluye la espera en que el canal
 * junta los mensajes del cliente antes de responder.
 */
export function ResponseTimeCard() {
  const t = useTranslations('Dashboard.ResponseTime');
  const intlLocale = toIntlLocale(useLocale());
  const { data, isLoading } = useResponseTime(PERIOD);

  const shortDate = (key: string) =>
    new Date(`${key}T12:00:00Z`).toLocaleDateString(intlLocale, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-surface">
      <SectionTitle>{t('title')}</SectionTitle>
      <div className="space-y-4 p-5">
        {isLoading || !data ? (
          <ChartSkeleton height={220} />
        ) : data.count === 0 ? (
          <p className="py-12 text-center text-sm text-text-tertiary">{t('noData')}</p>
        ) : (
          <>
            <div>
              <p className="font-geist-mono text-4xl font-light tracking-tight text-text-primary">
                {seconds(data.p50)}
              </p>
              <p className="mt-1 text-xs font-medium text-text-tertiary">
                {t('hint', {
                  p90: seconds(data.p90),
                  count: data.count.toLocaleString(intlLocale),
                })}
              </p>
            </div>

            <ResponsiveContainer width="100%" height={140} minWidth={0}>
              <LineChart data={data.daily} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.05} />
                <XAxis
                  dataKey="date"
                  tickFormatter={shortDate}
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={24}
                />
                <YAxis
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${Math.round(Number(v) / 1000)}s`}
                />
                <Tooltip
                  cursor={{ stroke: 'currentColor', strokeOpacity: 0.1 }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const point = payload[0].payload as (typeof data.daily)[number];
                    return (
                      <div className="rounded-xl border border-border bg-surface-popover px-3 py-2 shadow-lg">
                        <p className="mb-1 text-xs text-text-tertiary">
                          {shortDate(String(label))}
                        </p>
                        <p className="text-sm font-semibold text-text-primary">
                          {t('tooltip', { value: seconds(point.p50), count: point.count })}
                        </p>
                      </div>
                    );
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="p50"
                  stroke="var(--chart-execution)"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>

            {data.byWorkflow.length > 0 && (
              <ul className="divide-y divide-border">
                {data.byWorkflow.map((workflow) => (
                  <li
                    key={workflow.workflowId}
                    className="flex items-center justify-between gap-3 py-2 text-sm"
                  >
                    <span className="truncate text-text-secondary">{workflow.name}</span>
                    <span className="shrink-0 font-medium text-text-primary">
                      {seconds(workflow.p50)}
                      <span className="ml-2 text-xs font-normal text-text-tertiary">
                        {t('responses', { count: workflow.count })}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <p className="text-xs text-text-tertiary">{t('note')}</p>
          </>
        )}
      </div>
    </div>
  );
}
