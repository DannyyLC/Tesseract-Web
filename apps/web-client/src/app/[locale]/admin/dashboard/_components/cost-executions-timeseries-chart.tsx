'use client';

import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity } from 'lucide-react';
import type { AdminAnalyticsTimeseriesPoint } from '@/lib/api/endpoints/billing/analytics-admin-api';
import { formatCompactNumber, formatUSD } from './format';

interface Props {
  points: AdminAnalyticsTimeseriesPoint[];
}

function formatDate(value: string): string {
  const [, month, day] = value.split('-');
  return `${day}/${month}`;
}

/** Tendencia diaria de ejecuciones (barras/área, eje izquierdo) y costo real (línea, eje derecho), en UTC. */
export function CostExecutionsTimeseriesChart({ points }: Props) {
  const hasData = points.some((point) => point.executions > 0);

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">
        Ejecuciones y costo real por día (hora de Ciudad de México)
      </h3>

      {!hasData ? (
        <div className="flex h-64 flex-col items-center justify-center text-center text-text-tertiary">
          <Activity size={28} className="opacity-40" />
          <p className="mt-3 text-sm">Sin ejecuciones en el rango seleccionado.</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280} minWidth={0}>
          <ComposedChart data={points} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorExecutions" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--chart-execution)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--chart-execution)" stopOpacity={0} />
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
              tickFormatter={formatDate}
            />
            <YAxis
              yAxisId="executions"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: 'var(--chart-axis)' }}
              tickFormatter={formatCompactNumber}
              allowDecimals={false}
              width={40}
            />
            <YAxis
              yAxisId="cost"
              orientation="right"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: 'var(--chart-axis)' }}
              tickFormatter={(value) => formatUSD(Number(value))}
              width={60}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as AdminAnalyticsTimeseriesPoint;
                return (
                  <div className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-xs text-text-primary shadow-xl">
                    <div className="mb-1 border-b border-[var(--border-subtle)] pb-1 font-semibold">
                      {formatDate(String(label))}
                    </div>
                    <div className="flex flex-col gap-1">
                      <span>
                        Ejecuciones: <span className="font-medium">{point.executions}</span>
                      </span>
                      <span>
                        Costo real: <span className="font-medium">{formatUSD(point.costUSD)}</span>
                      </span>
                    </div>
                  </div>
                );
              }}
            />
            <Area
              yAxisId="executions"
              type="monotone"
              dataKey="executions"
              stroke="var(--chart-execution)"
              fill="url(#colorExecutions)"
              fillOpacity={1}
              animationDuration={800}
            />
            <Line
              yAxisId="cost"
              type="monotone"
              dataKey="costUSD"
              stroke="var(--chart-danger)"
              strokeWidth={2}
              dot={false}
              animationDuration={800}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
