import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useWorkflowMetrics } from '@/hooks/automation/use-workflows';
import { DashboardWorkflowDto } from '@tesseract/types';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Activity } from 'lucide-react';
import { formatDateByGranularity, getGranularityLabel } from '@/utils/date-formatters';

interface WorkflowAnalyticsPanelProps {
  workflow: DashboardWorkflowDto;
}

const PERIODS = [
  { label: 'Today', value: '24h' },
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
  { label: '90d', value: '90d' },
  { label: 'All', value: 'all' },
];

const formatCompactNumber = (number: number) => {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    compactDisplay: 'short',
  }).format(number);
};

export default function WorkflowAnalyticsPanel({ workflow }: WorkflowAnalyticsPanelProps) {
  const [period, setPeriod] = useState('30d');

  // Fetch detailed metrics in parallel
  const { data: metrics, isLoading } = useWorkflowMetrics(workflow.id, period);

  const chartData = useMemo(() => metrics?.executionHistoryChart ?? [], [metrics]);
  const errors = metrics?.errorDistribution ?? {};
  const failedFromChart = useMemo(
    () => chartData.reduce((sum, point) => sum + point.failed, 0),
    [chartData],
  );

  // Check if there's real data (at least one execution)
  const hasRealData = useMemo(() => chartData.some((d) => d.count > 0), [chartData]);

  if (isLoading) {
    return (
      <div className="grid animate-pulse grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 rounded-2xl bg-surface-secondary" />
        ))}
        <div className="col-span-full mt-4 h-64 rounded-2xl bg-surface-secondary" />
      </div>
    );
  }

  // Safe defaults
  const kpis = {
    total: metrics?.totalExecutions ?? 0,
    successRate: metrics?.successRate ?? 0,
    avgDuration: metrics?.avgDuration ?? 0,
    failed: failedFromChart,
  };

  return (
    <div className="space-y-6">
      {/* 1. KPIs Row */}
      <div className="mb-8 grid grid-cols-2 gap-8 px-2 lg:grid-cols-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-col justify-between"
        >
          <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Ejecuciones
          </span>
          <div className="mt-1 flex items-baseline gap-1">
            <p className="font-geist-mono text-4xl font-light tracking-tight text-text-primary">
              {kpis.total}
            </p>
            <span className="text-xs font-medium text-text-tertiary">
              En este periodo
            </span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col justify-between border-[var(--border-subtle)] lg:border-l lg:pl-8"
        >
          <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Tasa de Éxito
          </span>
          <div className="mt-1 flex w-full flex-col gap-2">
            <div className="flex items-baseline gap-1">
              <p className="font-geist-mono text-4xl font-light tracking-tight text-text-primary">
                {kpis.successRate.toFixed(1)}%
              </p>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-surface-secondary">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${kpis.successRate}%` }}
                className="h-full rounded-full bg-success-500"
              />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex flex-col justify-between border-[var(--border-subtle)] lg:border-l lg:pl-8"
        >
          <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Tiempo Promedio
          </span>
          <div className="mt-1 flex items-baseline gap-1">
            <p className="font-geist-mono text-4xl font-light tracking-tight text-text-primary">
              {kpis.avgDuration.toFixed(2)}s
            </p>
            <span className="text-xs font-medium text-text-tertiary">
              Por ejecución
            </span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="flex flex-col justify-between border-[var(--border-subtle)] lg:border-l lg:pl-8"
        >
          <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Fallidas
          </span>
          <div className="mt-1 flex items-baseline gap-1">
            <p
              className={`font-geist-mono text-4xl font-light tracking-tight ${kpis.failed > 0 ? 'text-danger' : 'text-text-primary'}`}
            >
              {kpis.failed}
            </p>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 2. Main Chart (Recharts) */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className={`${Object.keys(errors).length > 0 ? 'lg:col-span-2' : 'lg:col-span-3'} flex flex-col rounded-2xl border border-border bg-surface p-6-panel`}
        >
          <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <h3 className="flex items-center gap-2 font-semibold text-text-primary">
              Actividad
              {metrics?.granularity && (
                <span className="text-xs font-normal text-text-tertiary">
                  ({getGranularityLabel(metrics.granularity)})
                </span>
              )}
            </h3>
            <div className="flex items-center gap-1 rounded-lg bg-[var(--surface-tint)] p-1">
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPeriod(p.value)}
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

          <div className="relative min-h-[300px] w-full min-w-0 flex-1">
            {!hasRealData ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-text-tertiary">
                <div className="flex h-16 w-16 items-center justify-center rounded-full">
                  <Activity size={32} />
                </div>
                <p className="mt-4 text-sm font-medium text-text-tertiary">
                  Sin ejecuciones en este período
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300} minWidth={0}>
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSuccess" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--chart-success)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--chart-success)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorFailed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--chart-danger)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--chart-danger)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: 'var(--chart-axis)' }}
                    tickMargin={10}
                    minTickGap={30}
                    interval="preserveStartEnd"
                    tickFormatter={(value) => formatDateByGranularity(value, metrics?.granularity)}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: 'var(--chart-axis)' }}
                    tickFormatter={formatCompactNumber}
                    allowDecimals={false}
                    width={45}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-xs text-text-primary shadow-xl">
                            <div className="mb-1 border-b border-[var(--border-subtle)] pb-1 font-semibold">
                              {formatDateByGranularity(String(label || ''), metrics?.granularity)}
                            </div>
                            <div className="mt-1 flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <div className="h-2 w-2 rounded-full bg-success-500"></div>
                                <span>
                                  Exitosas: <span className="font-medium">{data.success}</span>
                                </span>
                              </div>
                              {data.failed > 0 && (
                                <div className="flex items-center gap-2">
                                  <div className="h-2 w-2 rounded-full bg-danger"></div>
                                  <span className="text-danger">
                                    Fallidas: <span className="font-medium">{data.failed}</span>
                                  </span>
                                </div>
                              )}
                              <div className="mt-1 border-t border-[var(--border-subtle)] pt-1 text-[var(--text-muted)]">
                                Total: {data.count}
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="success"
                    stroke="var(--chart-success)"
                    fill="url(#colorSuccess)"
                    fillOpacity={1}
                    animationDuration={1000}
                    activeDot={{
                      r: 4,
                      fill: 'var(--chart-success)',
                      stroke: 'var(--brand-white)',
                      strokeWidth: 2,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="failed"
                    stroke="var(--chart-danger)"
                    fill="url(#colorFailed)"
                    fillOpacity={1}
                    animationDuration={1000}
                    activeDot={{
                      r: 4,
                      fill: 'var(--chart-danger)',
                      stroke: 'var(--brand-white)',
                      strokeWidth: 2,
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>

        {/* 3. Error Distribution */}
        {Object.keys(errors).length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="rounded-2xl border border-border bg-surface p-6-panel"
          >
            <h3 className="mb-6 flex items-center gap-2 font-semibold text-text-primary">
              Errores Frecuentes
            </h3>

            <div className="space-y-5">
              {Object.entries(errors)
                .sort(([, a], [, b]) => b - a)
                .map(([errorName, count], idx) => {
                  // Format name: API_ERROR -> API Error
                  const formattedName = errorName
                    .split('_')
                    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
                    .join(' ');

                  const totalErrors = Object.values(errors).reduce((a, b) => a + b, 0);
                  const percentage = (count / totalErrors) * 100;

                  return (
                    <div key={idx} className="group space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-text-primary">
                            {formattedName}
                          </span>
                          <span className="rounded-md bg-[var(--surface-tint)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
                            {percentage.toFixed(0)}%
                          </span>
                        </div>
                        <span className="font-mono text-xs text-text-secondary">
                          {count}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-secondary">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${percentage}%` }}
                          transition={{ duration: 1, delay: 0.5 + idx * 0.1 }}
                          className={`h-full rounded-full ${
                            errorName === 'TIMEOUT'
                              ? 'bg-[var(--chart-timeout)]'
                              : errorName === 'API_ERROR'
                                ? 'bg-danger-400'
                                : errorName === 'RATE_LIMIT'
                                  ? 'bg-[var(--chart-rate-limit)]'
                                  : errorName === 'HALLUCINATION'
                                    ? 'bg-[var(--chart-hallucination)]'
                                    : 'bg-neutral-400'
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
