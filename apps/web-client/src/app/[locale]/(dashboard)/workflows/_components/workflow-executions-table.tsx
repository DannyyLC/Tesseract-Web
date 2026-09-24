'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity } from 'lucide-react';
import { CursorPager } from '@/components/ui/cursor-pager';
import { usePageSize } from '@/hooks/shared/use-page-size';
import { useDashboardExecutions } from '@/hooks/automation/use-executions';
import DashboardExecutionItem from './dashboard-execution-item';
import { useTranslations } from 'next-intl';

interface WorkflowExecutionsTableProps {
  workflowId: string;
  period: string;
}

function periodToDateRange(period: string): { startDate?: Date; endDate?: Date } {
  if (period === 'all') return {};
  const now = new Date();
  const startDate = new Date(now);
  startDate.setHours(0, 0, 0, 0);
  const daysBack: Record<string, number> = { '24h': 0, '7d': 6, '30d': 29, '90d': 89 };
  const days = daysBack[period];
  if (days === undefined) return {};
  startDate.setDate(startDate.getDate() - days);
  return { startDate, endDate: now };
}

export default function WorkflowExecutionsTable({
  workflowId,
  period,
}: WorkflowExecutionsTableProps) {
  const t = useTranslations('WorkflowDetail');
  const { pageSize, setPageSize } = usePageSize('workflow-executions');
  const [cursor, setCursor] = useState<string | null>(null);
  const [action, setAction] = useState<'next' | 'prev' | null>(null);

  // Memoized so Date objects are stable across renders — prevents React Query from
  // seeing a new query key (and firing a new request) on every render.
  const dateRange = useMemo(() => periodToDateRange(period), [period]);

  // Reset cursor when period changes
  useEffect(() => {
    setCursor(null);
    setAction(null);
  }, [period]);

  const { data, isLoading } = useDashboardExecutions({
    workflowId,
    cursor,
    action,
    pageSize,
    ...dateRange,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-secondary" />
        ))}
      </div>
    );
  }

  const executions = data?.items ?? [];

  if (executions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] py-12 text-text-tertiary">
        <Activity size={28} className="mb-3 opacity-40" />
        <p className="text-sm font-medium">{t('chartNoExecutions')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {executions.map((execution) => (
        <DashboardExecutionItem key={execution.id} execution={execution} />
      ))}

      <CursorPager
        prevCursor={data?.prevCursor ?? null}
        nextCursor={data?.nextCursor ?? null}
        nextPageAvailable={data?.nextPageAvailable ?? false}
        prevLabel={t('executionsPrev')}
        nextLabel={t('executionsNext')}
        onNavigate={(nextCursor, nextAction) => {
          setCursor(nextCursor);
          setAction(nextAction);
        }}
        pageSize={pageSize}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setCursor(null);
          setAction(null);
        }}
      />
    </div>
  );
}
