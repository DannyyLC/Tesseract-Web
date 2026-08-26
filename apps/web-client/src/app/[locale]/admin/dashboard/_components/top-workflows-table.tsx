import { ListOrdered } from 'lucide-react';
import type { AdminAnalyticsTopWorkflow } from '@/lib/api/endpoints/billing/analytics-admin-api';
import { formatUSD } from './format';

interface Props {
  items: AdminAnalyticsTopWorkflow[];
  metric: 'cost' | 'executions';
  onMetricChange: (metric: 'cost' | 'executions') => void;
}

export function TopWorkflowsTable({ items, metric, onMetricChange }: Props) {
  return (
    <section className="rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-border p-4">
        <h3 className="text-sm font-semibold text-text-primary">Top workflows</h3>
        <div className="flex items-center gap-1 rounded-lg bg-surface-secondary p-1">
          {(
            [
              { value: 'cost', label: 'Por costo' },
              { value: 'executions', label: 'Por ejecuciones' },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              onClick={() => onMetricChange(option.value)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                metric === option.value
                  ? 'bg-surface text-text-primary shadow-sm'
                  : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center text-text-tertiary">
          <ListOrdered size={24} className="opacity-40" />
          <p className="mt-3 text-sm">Sin workflows con ejecuciones en el rango.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.workflowId} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-text-primary">{item.workflowName}</p>
                <p className="text-xs text-text-secondary">
                  {item.organizationName} · {item.category}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-medium text-text-primary">{formatUSD(item.costUSD)}</p>
                <p className="text-xs text-text-secondary">{item.executions} ejecuciones</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
