import type { ReactNode } from 'react';
import { Activity } from 'lucide-react';
import {
  formatCompactNumber,
  formatPct,
  formatUSD,
} from '@/app/[locale]/admin/dashboard/_components/format';

export { formatCompactNumber, formatPct, formatUSD };

/** Colores fijos de cada lado de la comparación: "este workflow" y "el comparado". */
export const PRIMARY_COLOR = 'var(--chart-execution)';
export const COMPARE_COLOR = 'var(--chart-warning)';

export const AXIS_TICK = { fontSize: 10, fill: 'var(--chart-axis)' };

export function formatTokens(value: number | null | undefined): string {
  return value == null ? '—' : formatCompactNumber(value);
}

export function formatNullableUSD(value: number | null | undefined): string {
  return value == null ? '—' : formatUSD(value);
}

/** Milisegundos a segundos legibles: la latencia de un workflow vive en segundos, no en ms. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  return seconds < 60 ? `${seconds.toFixed(1)} s` : `${(seconds / 60).toFixed(1)} min`;
}

/** `YYYY-MM-DD` a `DD/MM`, igual que los ejes del dashboard. */
export function formatDay(value: string): string {
  const [, month, day] = value.split('-');
  return `${day}/${month}`;
}

/** Tarjeta de gráfica del panel de admin: borde, título con línea inferior y estado vacío. */
export function ChartCard({
  title,
  subtitle,
  legend,
  isEmpty,
  emptyText,
  children,
}: {
  title: string;
  subtitle?: string;
  legend?: ReactNode;
  isEmpty?: boolean;
  emptyText?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-text-tertiary">{subtitle}</p>}
        </div>
        {legend}
      </div>
      <div className="p-5">
        {isEmpty ? (
          <div className="flex h-64 flex-col items-center justify-center text-center text-text-tertiary">
            <Activity size={28} className="opacity-40" />
            <p className="mt-3 text-sm">{emptyText}</p>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          {item.dashed ? (
            <span
              className="inline-block w-3 border-t-2 border-dashed"
              style={{ borderColor: item.color }}
            />
          ) : (
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: item.color }}
            />
          )}
          {item.label}
        </span>
      ))}
    </div>
  );
}

/** Caja del tooltip de recharts con el estilo de los del dashboard. */
export function TooltipBox({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string; color?: string }[];
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-popover px-3 py-2 text-xs text-text-primary shadow-lg">
      <div className="mb-1 border-b border-[var(--border-subtle)] pb-1 font-semibold">{title}</div>
      <div className="flex flex-col gap-1">
        {rows.map((row) => (
          <span key={row.label} className="inline-flex items-center gap-1.5">
            {row.color && (
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: row.color }}
              />
            )}
            {row.label}: <span className="font-medium">{row.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
