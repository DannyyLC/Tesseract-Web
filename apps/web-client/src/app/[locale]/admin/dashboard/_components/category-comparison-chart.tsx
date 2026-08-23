'use client';

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Scale } from 'lucide-react';
import type { AdminAnalyticsCategoryRow } from '@/lib/api/endpoints/billing/analytics-admin-api';
import { formatUSD } from './format';

interface Props {
  rows: AdminAnalyticsCategoryRow[];
}

const CATEGORY_LABEL: Record<string, string> = {
  LIGHT: 'Light',
  STANDARD: 'Standard',
  ADVANCED: 'Advanced',
};

/**
 * Compara, por categoría de workflow, el costo real (tokens de LLM) contra lo que se cobra en
 * créditos ya convertido a USD según el plan de cada organización. Es la métrica que responde
 * "¿el precio por ejecución cubre lo que de verdad cuesta?".
 */
export function CategoryComparisonChart({ rows }: Props) {
  const hasData = rows.some((row) => row.executions > 0);
  const data = rows.map((row) => ({
    category: CATEGORY_LABEL[row.category] ?? row.category,
    'Costo real': Number(row.costUSD.toFixed(4)),
    'Cobrado (estimado)': Number(row.estimatedRevenueUSD.toFixed(4)),
    executions: row.executions,
    marginPct: row.marginPct,
  }));

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">Costo real vs. cobrado, por categoría</h3>

      {!hasData ? (
        <div className="flex h-64 flex-col items-center justify-center text-center text-text-tertiary">
          <Scale size={28} className="opacity-40" />
          <p className="mt-3 text-sm">Sin ejecuciones en el rango seleccionado.</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280} minWidth={0}>
          <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
            <XAxis
              dataKey="category"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: 'var(--chart-axis)' }}
              tickFormatter={(value) => formatUSD(Number(value))}
              width={70}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as (typeof data)[number];
                return (
                  <div className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-xs text-text-primary shadow-xl">
                    <div className="mb-1 border-b border-[var(--border-subtle)] pb-1 font-semibold">{label}</div>
                    <div className="flex flex-col gap-1">
                      <span>
                        Costo real: <span className="font-medium">{formatUSD(point['Costo real'])}</span>
                      </span>
                      <span>
                        Cobrado: <span className="font-medium">{formatUSD(point['Cobrado (estimado)'])}</span>
                      </span>
                      <span className="text-text-tertiary">
                        {point.executions} ejecuciones
                        {point.marginPct != null ? ` · margen ${point.marginPct.toFixed(1)}%` : ''}
                      </span>
                    </div>
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Costo real" fill="var(--chart-danger)" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Cobrado (estimado)" fill="var(--chart-success)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
