import { useTranslations } from 'next-intl';
import { KpiCard } from '@/app/[locale]/admin/dashboard/_components/kpi-cards';
import type { AdminWorkflowAnalyticsKpis } from '@/lib/api/endpoints/billing/analytics-admin-api';
import {
  formatCompactNumber,
  formatDuration,
  formatNullableUSD,
  formatPct,
  formatTokens,
  formatUSD,
} from './shared';

/**
 * Arriba, el negocio (volumen, costo, cobrado, margen); abajo, lo que explica el costo de cada
 * ejecución (costo unitario, tokens de entrada y salida, duración). El valor grande es el
 * promedio; mediana y p95 van en la pista, porque un promedio solo esconde las colas caras.
 */
export function WorkflowKpis({ kpis }: { kpis: AdminWorkflowAnalyticsKpis }) {
  const t = useTranslations('Admin.WorkflowMetrics.Kpis');
  const marginTone =
    kpis.marginUSD == null ? 'default' : kpis.marginUSD >= 0 ? 'success' : 'danger';

  return (
    <div className="space-y-8 rounded-2xl border border-border bg-surface p-6">
      <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
        <KpiCard
          label={t('executions')}
          value={formatCompactNumber(kpis.executions)}
          hint={t('executionsHint', {
            rate: formatPct(kpis.successRate),
            failed: kpis.failed,
          })}
        />
        <KpiCard
          divided
          label={t('realCost')}
          value={formatUSD(kpis.costUSD)}
          hint={t('realCostHint')}
        />
        <KpiCard
          divided
          label={t('charged')}
          value={formatNullableUSD(kpis.estimatedRevenueUSD)}
          hint={
            kpis.estimatedRevenueUSD == null
              ? t('unpricedHint')
              : t('creditsHint', { count: kpis.creditsCharged })
          }
        />
        <KpiCard
          divided
          label={t('margin')}
          value={formatNullableUSD(kpis.marginUSD)}
          hint={
            kpis.marginPct != null
              ? t('marginPctHint', { pct: formatPct(kpis.marginPct) })
              : t('marginNoBaseHint')
          }
          tone={marginTone}
        />
      </div>

      <div className="grid grid-cols-2 gap-8 border-t border-[var(--border-subtle)] pt-8 md:grid-cols-4">
        <KpiCard
          label={t('costPerExecution')}
          value={formatNullableUSD(kpis.costPerExecution.avg)}
          hint={t('distributionHint', {
            p50: formatNullableUSD(kpis.costPerExecution.p50),
            p95: formatNullableUSD(kpis.costPerExecution.p95),
          })}
        />
        <KpiCard
          divided
          label={t('inputTokens')}
          value={formatTokens(kpis.inputTokens.avg)}
          hint={t('distributionHint', {
            p50: formatTokens(kpis.inputTokens.p50),
            p95: formatTokens(kpis.inputTokens.p95),
          })}
        />
        <KpiCard
          divided
          label={t('outputTokens')}
          value={formatTokens(kpis.outputTokens.avg)}
          hint={
            kpis.inputOutputRatio != null
              ? t('ratioHint', { ratio: kpis.inputOutputRatio.toFixed(1) })
              : t('distributionHint', {
                  p50: formatTokens(kpis.outputTokens.p50),
                  p95: formatTokens(kpis.outputTokens.p95),
                })
          }
        />
        <KpiCard
          divided
          label={t('duration')}
          value={formatDuration(kpis.durationMs.p50)}
          hint={t('durationHint', { p95: formatDuration(kpis.durationMs.p95) })}
        />
      </div>
    </div>
  );
}
