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
  size = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'success' | 'danger';
  size?: 'default' | 'large';
}) {
  const valueColor =
    tone === 'success' ? 'text-success-500' : tone === 'danger' ? 'text-danger' : 'text-text-primary';

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <span className="text-xs font-medium uppercase tracking-wide text-text-secondary">{label}</span>
      <p className={`mt-2 font-semibold ${valueColor} ${size === 'large' ? 'text-3xl' : 'text-2xl'}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-text-secondary">{hint}</p>}
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
  const marginTone = kpis.marginUSD >= 0 ? 'success' : 'danger';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card
          label="Ejecuciones"
          value={formatCompactNumber(kpis.totalExecutions)}
          hint={`${formatCompactNumber(kpis.activeOrganizations)} organizaciones con actividad`}
        />
        <Card label="Costo real" value={formatUSD(kpis.totalCostUSD)} hint="Tokens de LLM, en USD" />
        <Card
          label="Cobrado (estimado)"
          value={formatUSD(kpis.estimatedRevenueUSD)}
          hint={
            kpis.unpricedOrganizations > 0
              ? `${kpis.unpricedOrganizations} org. sin precio resoluble excluidas`
              : `${kpis.totalCreditsCharged} créditos`
          }
        />
        <Card
          label="Margen"
          value={formatUSD(kpis.marginUSD)}
          hint={kpis.marginPct != null ? `${formatPct(kpis.marginPct)} sobre lo cobrado` : 'Sin base para calcular %'}
          tone={marginTone}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card
          label="Tasa de overage"
          value={formatPct(kpis.overageRate)}
          hint={`${formatCompactNumber(kpis.overageExecutions)} ejecuciones en balance negativo`}
          size="large"
        />
        <Card
          label="Créditos cobrados"
          value={formatCompactNumber(kpis.totalCreditsCharged)}
          hint="Fijos por categoría de workflow"
          size="large"
        />
      </div>
    </div>
  );
}
