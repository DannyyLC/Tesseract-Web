'use client';

import { useLocale, useTranslations } from 'next-intl';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useCreditsProjection } from '@/hooks/billing/use-billing';
import { toIntlLocale } from '@/lib/intl-locale';
import type { CreditsProjectionData } from '@/lib/api/endpoints/billing/billing-api';
import { ChartSkeleton, SectionTitle } from './dashboard-section';

const AXIS_TICK = { fontSize: 12, fill: 'currentColor', opacity: 0.4 };
const COLOR = 'var(--chart-execution)';

/**
 * Hasta dónde se le da una fecha exacta al cliente. Más allá no se dice "en 2,000 días": con
 * créditos acumulados, una fecha lejana se lee como "¿para qué estoy pagando?". La gráfica
 * tampoco proyecta más lejos.
 */
const SOON_DAYS = 30;

/** Días entre dos claves `YYYY-MM-DD`, sin pasar por la zona del navegador. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

interface ChartPoint {
  date: string;
  actual?: number;
  expected?: number;
}

/**
 * Une el saldo real de los últimos días con la proyección (la del backend ya se detiene al
 * renovar), recortada a `SOON_DAYS`. El último punto real se repite como inicio de la
 * proyección para que la línea punteada salga de donde termina la sólida.
 */
function buildChart(data: CreditsProjectionData, todayKey: string): ChartPoint[] {
  const points: ChartPoint[] = data.history.map((p) => ({ date: p.date, actual: p.balance }));
  const last = points[points.length - 1];
  if (last?.actual != null && data.projected.length > 0) last.expected = last.actual;
  for (const p of data.projected) {
    if (last && p.date === last.date) continue;
    if (daysBetween(todayKey, p.date) > SOON_DAYS) break;
    points.push({ date: p.date, expected: p.balance });
  }
  return points;
}

/**
 * ¿Cuándo se acaban mis créditos? Saldo real de las últimas dos semanas y su continuación al
 * ritmo de consumo de la organización (ver `credit-projection.ts` en el gateway).
 */
export function CreditsProjectionCard() {
  const t = useTranslations('Dashboard.CreditsProjection');
  const intlLocale = toIntlLocale(useLocale());
  const { data, isLoading } = useCreditsProjection();

  // Las fechas ya son días locales de la organización: se formatean en UTC para no correrlas.
  const longDate = (key: string) =>
    new Date(`${key}T12:00:00Z`).toLocaleDateString(intlLocale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    });
  const shortDate = (key: string) =>
    new Date(`${key}T12:00:00Z`).toLocaleDateString(intlLocale, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
  const num = (value: number) => value.toLocaleString(intlLocale);

  if (isLoading || !data) {
    return (
      <div className="rounded-2xl border border-border bg-surface">
        <SectionTitle>{t('title')}</SectionTitle>
        <div className="p-5">
          <ChartSkeleton height={220} />
        </div>
      </div>
    );
  }

  const todayKey = data.history[data.history.length - 1]?.date ?? '';
  // El `status` garantiza cuáles vienen; el respaldo solo evita aserciones.
  const depletion = data.depletionDate ?? todayKey;
  const renewal = data.renewalDate ?? todayKey;
  // Solo hay fecha exacta si se agotan antes de renovar o en los próximos `SOON_DAYS`.
  const showsDate =
    data.status === 'depletes_before_renewal' ||
    (data.status === 'depletes' && daysBetween(todayKey, depletion) <= SOON_DAYS);
  const headline = (() => {
    switch (data.status) {
      case 'insufficient_data':
        return t('insufficientData');
      case 'no_consumption':
        return t('noConsumption');
      case 'already_depleted':
        return t('alreadyDepleted');
      case 'depletes_before_renewal':
        return t.rich('depletesBeforeRenewal', {
          date: longDate(depletion),
          days: daysBetween(depletion, renewal),
          strong: (chunks) => (
            <strong className="text-[var(--danger-text-adaptive)]">{chunks}</strong>
          ),
        });
      // Sin cantidad sobrante: "te sobrarán 3,000" invita a pensar que se paga de más.
      case 'lasts_until_renewal':
        return t.rich('lastsUntilRenewal', {
          date: longDate(renewal),
          strong: (chunks) => (
            <strong className="text-[var(--success-text-adaptive)]">{chunks}</strong>
          ),
        });
      case 'depletes':
        return showsDate
          ? t.rich('depletes', {
              date: longDate(depletion),
              days: daysBetween(todayKey, depletion),
              strong: (chunks) => <strong className="text-text-primary">{chunks}</strong>,
            })
          : t('lastsOverMonth');
      case 'lasts_beyond_horizon':
        return t('lastsOverMonth');
    }
  })();

  const chart = buildChart(data, todayKey);
  const showChart = data.history.length > 0 && data.status !== 'insufficient_data';
  const renewalInChart = data.renewalDate != null && chart.some((p) => p.date === renewal);

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-surface">
      <SectionTitle>{t('title')}</SectionTitle>
      <div className="space-y-4 p-5">
        <div className="space-y-1">
          <p className="text-sm leading-relaxed text-text-secondary">{headline}</p>
          {showsDate && data.range && (
            <p className="text-xs text-text-tertiary">
              {data.range.latest
                ? t('range', {
                    earliest: shortDate(data.range.earliest),
                    latest: shortDate(data.range.latest),
                  })
                : t('rangeOpen', { earliest: shortDate(data.range.earliest) })}
            </p>
          )}
          {showsDate && data.overageLimitDate && (
            <p className="text-xs text-[var(--warning-text-adaptive)]">
              {t('overageLimit', { date: shortDate(data.overageLimitDate) })}
            </p>
          )}
        </div>

        {showChart && (
          <ResponsiveContainer width="100%" height={200} minWidth={0}>
            <ComposedChart data={chart} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
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
                tickFormatter={(v) => num(Number(v))}
              />
              <Tooltip
                cursor={{ stroke: 'currentColor', strokeOpacity: 0.1 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const point = payload[0].payload as ChartPoint;
                  return (
                    <div className="rounded-xl border border-border bg-surface-popover px-3 py-2 shadow-lg">
                      <p className="mb-1 text-xs text-text-tertiary">{shortDate(String(label))}</p>
                      {point.actual != null && (
                        <p className="text-sm font-semibold text-text-primary">
                          {t('tooltipActual', { value: num(point.actual) })}
                        </p>
                      )}
                      {point.actual == null && point.expected != null && (
                        <p className="text-sm font-semibold text-text-primary">
                          {t('tooltipExpected', { value: num(point.expected) })}
                        </p>
                      )}
                    </div>
                  );
                }}
              />
              <Line
                dataKey="actual"
                stroke={COLOR}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
              <Line
                dataKey="expected"
                stroke={COLOR}
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                connectNulls={false}
              />
              <ReferenceLine y={0} stroke="var(--chart-danger)" strokeOpacity={0.5} />
              {renewalInChart && (
                <ReferenceLine
                  x={renewal}
                  stroke="var(--chart-success)"
                  strokeDasharray="4 4"
                  label={{
                    value: t('renewal'),
                    position: 'insideTopRight',
                    fontSize: 11,
                    fill: 'var(--chart-success)',
                  }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {data.method && data.status !== 'no_consumption' && (
          <p className="text-xs text-text-tertiary">
            {t(data.method === 'weekday' ? 'methodWeekday' : 'methodFlat', {
              avg: num(data.avgDailyConsumption),
            })}
          </p>
        )}
      </div>
    </div>
  );
}
