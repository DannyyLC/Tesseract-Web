import { useTranslations } from 'next-intl';
import type { AdminAnalyticsKpis } from '@/lib/api/endpoints/billing/analytics-admin-api';
import { formatCompactNumber, formatPct, formatUSD } from './format';

interface Props {
  kpis: AdminAnalyticsKpis;
}

function Card({
  label,
  value,
  hint,
  tone = 'default',
  divided = false,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'success' | 'danger';
  /** Línea a la izquierda para separarla de la anterior (como los KPIs del dashboard de usuario). */
  divided?: boolean;
}) {
  const valueColor =
    tone === 'success'
      ? 'text-[var(--success-text-adaptive)]'
      : tone === 'danger'
        ? 'text-danger'
        : 'text-text-primary';

  return (
    <div
      className={`flex flex-col justify-between ${divided ? 'border-[var(--border-subtle)] md:border-l md:pl-8' : ''}`}
    >
      <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
        {label}
      </span>
      <p className={`font-geist-mono text-3xl font-light tracking-tight xl:text-4xl ${valueColor}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs font-medium text-text-tertiary">{hint}</p>}
    </div>
  );
}

/**
 * KPIs de plataforma. `activeOrganizations` es solo la que tuvo actividad en el rango, no el
 * total de la plataforma — se etiqueta explícito para no confundir una cosa con la otra.
 *
 * Dos filas: la de arriba son los cuatro números "de negocio" (ejecuciones, costo, cobrado,
 * margen); la de abajo son overage y créditos — igual de relevantes, pero se destacan aparte,
 * ocupando todo el ancho, en vez de competir por espacio con los otros cuatro.
 */
export function KpiCards({ kpis }: Props) {
  const t = useTranslations('Admin.Dashboard.Kpis');
  const marginTone = kpis.marginUSD >= 0 ? 'success' : 'danger';

  return (
    <div className="space-y-8 px-2">
      <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
        <Card
          label={t('executions')}
          value={formatCompactNumber(kpis.totalExecutions)}
          hint={t('activeOrgsHint', { count: formatCompactNumber(kpis.activeOrganizations) })}
        />
        <Card
          label={t('realCost')}
          value={formatUSD(kpis.totalCostUSD)}
          hint={t('realCostHint')}
          divided
        />
        <Card
          divided
          label={t('charged')}
          value={formatUSD(kpis.estimatedRevenueUSD)}
          hint={
            kpis.unpricedOrganizations > 0
              ? t('unpricedOrgsHint', { count: kpis.unpricedOrganizations })
              : t('creditsHint', { count: kpis.totalCreditsCharged })
          }
        />
        <Card
          divided
          label={t('margin')}
          value={formatUSD(kpis.marginUSD)}
          hint={
            kpis.marginPct != null
              ? t('marginPctHint', { pct: formatPct(kpis.marginPct) })
              : t('marginNoBaseHint')
          }
          tone={marginTone}
        />
      </div>

      <div className="grid grid-cols-1 gap-8 border-t border-[var(--border-subtle)] pt-8 md:grid-cols-2">
        <Card
          label={t('overageRate')}
          value={formatPct(kpis.overageRate)}
          hint={t('overageRateHint', { count: formatCompactNumber(kpis.overageExecutions) })}
        />
        <Card
          label={t('creditsCharged')}
          value={formatCompactNumber(kpis.totalCreditsCharged)}
          hint={t('creditsChargedHint')}
          divided
        />
      </div>
    </div>
  );
}
