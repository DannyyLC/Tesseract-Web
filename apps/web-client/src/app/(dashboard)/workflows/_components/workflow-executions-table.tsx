'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, ChevronLeft, ChevronRight } from 'lucide-react';
import { useDashboardExecutions } from '@/hooks/automation/use-executions';
import DashboardExecutionItem from './dashboard-execution-item';

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

const PAGE_SIZE = 10;

export default function WorkflowExecutionsTable({ workflowId, period }: WorkflowExecutionsTableProps) {
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
    pageSize: PAGE_SIZE,
    ...dateRange,
  });

  const handleNext = () => {
    if (data?.nextCursor) {
      setCursor(data.nextCursor);
      setAction('next');
    }
  };

  const handlePrev = () => {
    if (data?.prevCursor) {
      setCursor(data.prevCursor);
      setAction('prev');
    }
  };

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
        <p className="text-sm font-medium">Sin ejecuciones en este periodo</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {executions.map((execution) => (
        <DashboardExecutionItem key={execution.id} execution={execution} />
      ))}

      {(data?.nextPageAvailable || cursor) && (
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={handlePrev}
            disabled={!data?.prevCursor}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-text-secondary transition-all hover:bg-[var(--surface-tint)] hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft size={14} />
            Anterior
          </button>
          <button
            onClick={handleNext}
            disabled={!data?.nextPageAvailable}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-text-secondary transition-all hover:bg-[var(--surface-tint)] hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            Siguiente
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
