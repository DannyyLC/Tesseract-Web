'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Clock } from 'lucide-react';
import { HourlyDistributionDto } from '@tesseract/types';
import { useTranslations } from 'next-intl';

interface HourlyDistributionChartProps {
  data?: HourlyDistributionDto | null;
  isLoading?: boolean;
  /** Se pinta a la derecha del título; el detalle de workflow mete ahí el selector de zona. */
  action?: React.ReactNode;
}

/** Etiqueta compacta del eje: 0h, 6h, 12h… */
const formatHour = (hour: number) => `${hour}h`;

/** Rango completo de la franja, para el tooltip: "14:00 – 14:59". */
const formatHourRange = (hour: number) =>
  `${String(hour).padStart(2, '0')}:00 – ${String(hour).padStart(2, '0')}:59`;

/**
 * Histograma de 24 barras con las horas a las que llega la actividad.
 *
 * Las horas vienen ya convertidas por el gateway a la zona indicada en `data.timezone`,
 * no se recalcula nada aquí: hacerlo en el navegador daría una gráfica distinta a cada
 * usuario y la pregunta que responde ("¿a qué hora recibe mensajes este negocio?") es
 * del negocio, no de quien mira la pantalla.
 */
export default function HourlyDistributionChart({
  data,
  isLoading = false,
  action,
}: HourlyDistributionChartProps) {
  const t = useTranslations('HourlyDistribution');

  const buckets = useMemo(() => data?.buckets ?? [], [data]);
  const hasData = (data?.total ?? 0) > 0;

  // La hora punta solo se resalta si destaca de verdad; con la actividad repartida,
  // teñir la barra más alta sugiere un patrón que no existe.
  const peakHour = useMemo(() => {
    if (!hasData || buckets.length === 0) return null;
    const max = Math.max(...buckets.map((bucket) => bucket.count));
    const average = data!.total / 24;
    if (max < average * 1.5) return null;
    return buckets.find((bucket) => bucket.count === max)?.hour ?? null;
  }, [buckets, hasData, data]);

  if (isLoading) {
    return <div className="h-72 animate-pulse rounded-2xl bg-surface-secondary" />;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="rounded-2xl border border-border bg-surface-primary p-6"
    >
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{t('title')}</h3>
          <p className="mt-1 text-xs text-text-tertiary">{t('subtitle')}</p>
        </div>
        {action}
      </div>

      {!hasData ? (
        <div className="flex h-64 flex-col items-center justify-center text-center">
          <div className="text-text-tertiary opacity-40">
            <Clock size={32} />
          </div>
          <p className="mt-4 text-sm font-medium text-text-tertiary">{t('empty')}</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260} minWidth={0}>
          <BarChart data={buckets} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
            <XAxis
              dataKey="hour"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: 'var(--chart-axis)' }}
              tickMargin={10}
              interval={2}
              tickFormatter={formatHour}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: 'var(--chart-axis)' }}
              allowDecimals={false}
              width={45}
            />
            <Tooltip
              cursor={{ fill: 'var(--chart-axis)', fillOpacity: 0.08 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const bucket = payload[0].payload as { hour: number; count: number };
                return (
                  <div className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-xs text-text-primary shadow-xl">
                    <div className="mb-1 border-b border-[var(--border-subtle)] pb-1 font-semibold">
                      {formatHourRange(bucket.hour)}
                    </div>
                    <div className="mt-1">
                      {t('tooltipExecutions', { count: bucket.count })}
                    </div>
                  </div>
                );
              }}
            />
            <Bar dataKey="count" radius={[3, 3, 0, 0]} animationDuration={800}>
              {buckets.map((bucket) => (
                <Cell
                  key={bucket.hour}
                  fill={
                    bucket.hour === peakHour ? 'var(--chart-active)' : 'var(--chart-execution)'
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* Sin esta etiqueta un eje 0–23 es indistinguible de uno mal calculado. */}
      {data?.timezone && (
        <p className="mt-3 text-center text-[11px] text-text-tertiary">
          {t('timezoneLabel', { timezone: data.timezone.replace(/_/g, ' ') })}
        </p>
      )}
    </motion.div>
  );
}
