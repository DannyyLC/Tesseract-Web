import { useLocale, useTranslations } from 'next-intl';
import { ListOrdered } from 'lucide-react';
import type { AdminWorkflowAnalyticsTopExecution } from '@/lib/api/endpoints/billing/analytics-admin-api';
import { chipClass } from '@/app/[locale]/admin/_styles';
import { formatDuration, formatTokens, formatUSD } from './shared';

/**
 * Las ejecuciones más caras del periodo. Es el puente entre "este workflow cuesta más" y "por
 * qué": con el id de conversación se puede abrir el caso concreto.
 */
export function TopExecutionsTable({
  items,
  timezone,
}: {
  items: AdminWorkflowAnalyticsTopExecution[];
  timezone: string;
}) {
  const t = useTranslations('Admin.WorkflowMetrics.TopExecutions');
  const locale = useLocale();
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString(locale, {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: timezone,
    });

  return (
    <section className="rounded-2xl border border-border bg-surface">
      <div className="border-b border-border p-5">
        <h3 className="text-lg font-semibold text-text-primary">{t('title')}</h3>
        <p className="mt-0.5 text-xs text-text-tertiary">{t('subtitle')}</p>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center text-text-tertiary">
          <ListOrdered size={24} className="opacity-40" />
          <p className="mt-3 text-sm">{t('empty')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto px-5 pb-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-text-secondary">
                <th className="py-3 pr-3 font-semibold">{t('date')}</th>
                <th className="py-3 pr-3 font-semibold">{t('status')}</th>
                <th className="py-3 pr-3 text-right font-semibold">{t('cost')}</th>
                <th className="py-3 pr-3 text-right font-semibold">{t('input')}</th>
                <th className="py-3 pr-3 text-right font-semibold">{t('output')}</th>
                <th className="py-3 pr-3 text-right font-semibold">{t('duration')}</th>
                <th className="py-3 font-semibold">{t('conversation')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-text-secondary">
                    {formatDate(item.startedAt)}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span
                      className={
                        item.status === 'COMPLETED'
                          ? chipClass
                          : 'rounded-full bg-[var(--danger-tint-hover)] px-2 py-0.5 text-xs text-danger'
                      }
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-right font-medium text-text-primary">
                    {formatUSD(item.costUSD)}
                  </td>
                  <td className="py-2.5 pr-3 text-right text-text-secondary">
                    {formatTokens(item.inputTokens)}
                  </td>
                  <td className="py-2.5 pr-3 text-right text-text-secondary">
                    {formatTokens(item.outputTokens)}
                  </td>
                  <td className="py-2.5 pr-3 text-right text-text-secondary">
                    {formatDuration(item.durationMs)}
                  </td>
                  <td
                    className="py-2.5 font-mono text-xs text-text-tertiary"
                    title={item.conversationId ?? ''}
                  >
                    {item.conversationId ? `${item.conversationId.slice(0, 8)}…` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
