import { useTranslations } from 'next-intl';
import { ListOrdered } from 'lucide-react';
import type { AdminAnalyticsTopWorkflow } from '@/lib/api/endpoints/billing/analytics-admin-api';
import { formatUSD } from './format';
import { segmentedItemClass, segmentedTrackClass } from '../../_styles';

interface Props {
  items: AdminAnalyticsTopWorkflow[];
  metric: 'cost' | 'executions';
  onMetricChange: (metric: 'cost' | 'executions') => void;
}

export function TopWorkflowsTable({ items, metric, onMetricChange }: Props) {
  const t = useTranslations('Admin.Dashboard.TopWorkflows');
  return (
    <section className="rounded-2xl border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-border p-5">
        <h3 className="text-lg font-semibold text-text-primary">{t('title')}</h3>
        <div className={segmentedTrackClass}>
          {(
            [
              { value: 'cost', label: t('byCost') },
              { value: 'executions', label: t('byExecutions') },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              onClick={() => onMetricChange(option.value)}
              className={segmentedItemClass(metric === option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center text-text-tertiary">
          <ListOrdered size={24} className="opacity-40" />
          <p className="mt-3 text-sm">{t('empty')}</p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li
              key={item.workflowId}
              className="flex items-center justify-between gap-3 px-5 py-3.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text-primary">
                  {item.workflowName}
                </p>
                <p className="text-xs text-text-secondary">
                  {item.organizationName} · {item.category}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-medium text-text-primary">{formatUSD(item.costUSD)}</p>
                <p className="text-xs text-text-secondary">
                  {t('executionsCount', { count: item.executions })}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
