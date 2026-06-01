'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { Activity, ArrowUpRight, Loader2 } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { useAuth } from '@/hooks/identity/use-auth';
import { useWorkflowStats } from '@/hooks/automation/use-workflows';
import { useExecutionsStats, useDashboardExecutions } from '@/hooks/automation/use-executions';
import { useBillingDashboard } from '@/hooks/billing/use-billing';
import { useUserStats } from '@/hooks/identity/use-users';
import PermissionGuard from '@/components/auth/permission-guard';
import { ROLE_PERMISSIONS } from '@tesseract/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function SectionTitle({
  children,
  href,
  linkLabel,
}: {
  children: React.ReactNode;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border p-5">
      <h2 className="text-lg font-semibold text-text-primary">{children}</h2>
      {href && (
        <Link
          href={href}
          className="flex items-center gap-1 text-sm text-black/50 transition-colors hover:text-text-primary"
        >
          {linkLabel}
          <ArrowUpRight size={14} />
        </Link>
      )}
    </div>
  );
}

// Custom tooltip for recharts with dark mode awareness
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const displayLabel = label
    ? (() => {
        const d = new Date(label + 'T00:00:00');
        const name = d.toLocaleDateString('es-MX', { weekday: 'short' });
        return name.charAt(0).toUpperCase() + name.slice(1);
      })()
    : null;
  return (
    <div className="rounded-xl border border-border bg-surface-popover px-3 py-2 shadow-lg">
      {displayLabel && (
        <p className="mb-1 text-xs text-text-tertiary">{displayLabel}</p>
      )}
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-sm font-semibold" style={{ color: p.color }}>
          {p.name}: {p.value?.toLocaleString()}
        </p>
      ))}
    </div>
  );
}

// ─── Skeleton for charts ──────────────────────────────────────────────────────
function ChartSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div
      className="w-full animate-pulse rounded-xl bg-surface-secondary"
      style={{ height }}
    />
  );
}

// ─── Generate last-7-days labels ──────────────────────────────────────────────
function getLast7DaysLabels() {
  const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return days[d.getDay()];
  });
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function DashboardPage() {
  const t = useTranslations('Dashboard');
  const { data: user } = useAuth();
  const userPermissions = user ? ROLE_PERMISSIONS[user.role] || [] : [];

  const hasBilling = userPermissions.includes('billing:read');
  const hasUsers = userPermissions.includes('users:read');
  const hasTopStats = hasBilling || hasUsers;

  // Data hooks
  const { data: workflowStats, isLoading: loadingWf } = useWorkflowStats();
  const { data: statsToday, isLoading: loadingToday } = useExecutionsStats('24h');
  const { data: stats7d, isLoading: loading7d } = useExecutionsStats('7d');
  const { data: billingData, isLoading: loadingBilling } = useBillingDashboard({
    enabled: hasBilling,
  });
  const { data: userStats, isLoading: loadingUsers } = useUserStats({ enabled: hasUsers });
  const { data: recentExecs, isLoading: loadingExecs } = useDashboardExecutions({ pageSize: 5 });

  // ── Area chart data — executions last 7 days ────────────────────────────────
  const areaData = useMemo(() => {
    // If backend provides dailyStats, use them
    if (stats7d?.dailyStats && stats7d.dailyStats.length > 0) {
      // Map to chart format { day: 'Lun', Ejecuciones: 10 }
      // Assuming dailyStats comes sorted or we just map by date
      return [...stats7d.dailyStats]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((stat) => {
          const date = new Date(stat.date + 'T00:00:00'); // appended time to ensure local day match if string is YYYY-MM-DD
          const dayName = date.toLocaleDateString('es-MX', { weekday: 'short' });
          // Capitalize first letter: 'lun' -> 'Lun'
          const day = dayName.charAt(0).toUpperCase() + dayName.slice(1);
          return {
            day,
            date: stat.date,
            Ejecuciones: stat.count,
          };
        });
    }

    // Fallback if no real data (e.g. while backend is being updated)
    // We just show last 7 days with 0 values to keep the chart structure
    const labels = getLast7DaysLabels();
    return labels.map((day) => ({
      day,
      Ejecuciones: 0,
    }));
  }, [stats7d]);

  // ── Pie chart data — active vs paused workflows ─────────────────────────────
  const pieData = useMemo(() => {
    const active = workflowStats?.activeWorkflows ?? 0;
    const total = workflowStats?.totalWorkflows ?? 0;
    // Calculate paused as total - active, ensuring non-negative
    const paused = Math.max(0, total - active);

    const data = [
      { name: t('pieActive'), value: active, fill: 'var(--chart-active)' },
      { name: t('piePaused'), value: paused, fill: 'var(--chart-warning)' },
    ];

    // Filter out zero values (e.g. if no paused workflows, don't show segment)
    return data.filter((d) => d.value > 0);
  }, [workflowStats]);

  // ── Radial bar data — credit usage (kept simple for availability) ──────────
  const creditData = useMemo(() => {
    const used = billingData?.credits?.usedThisMonth ?? 0;
    const available = billingData?.credits?.available ?? 0;
    return { used, available };
  }, [billingData]);

  // ── Credit low alert ─────────────────────────────────────────────────────────
  // (Removed unused creditLow variable)

  // ── Recent executions list ───────────────────────────────────────────────────
  const executions = recentExecs?.items ?? [];

  function statusLabel(s: string) {
    if (s === 'COMPLETED') return t('statusCompleted');
    if (s === 'FAILED') return t('statusFailed');
    if (s === 'RUNNING') return t('statusRunning');
    if (s === 'PENDING') return t('statusPending');
    if (s === 'CANCELLED') return t('statusCancelled');
    if (s === 'TIMEOUT') return t('statusTimeout');
    return s;
  }

  return (
    <div className="space-y-6 pb-16">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-text-primary md:text-3xl">
              {user?.name ? t('greeting', { name: user.name.split(' ')[0] }) : t('dashboardFallback')}
            </h1>
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            {user?.organizationName ?? t('orgFallback')} · {t('activitySummary')}
          </p>
        </div>
      </div>

      {/* ── Stats ──────────────────────────────────────────────────────────── */}
      <div
        className={`mb-8 grid grid-cols-2 gap-8 px-2 ${hasTopStats ? 'lg:grid-cols-4' : 'lg:grid-cols-2'}`}
      >
        {/* Workflows Activos — all roles */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-col justify-between"
        >
          <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
            {t('activeWorkflows')}
          </span>
          <div className="mt-1 flex items-baseline gap-1">
            {loadingWf ? (
              <Loader2 size={18} className="animate-spin text-text-tertiary" />
            ) : (
              <>
                <p className="font-geist-mono text-4xl font-light tracking-tight text-text-primary">
                  {workflowStats?.activeWorkflows ?? 0}
                </p>
                <span className="text-xs font-medium text-text-tertiary">
                  {t('of')} {workflowStats?.totalWorkflows ?? 0}
                </span>
              </>
            )}
          </div>
        </motion.div>

        {/* Ejecuciones Hoy — all roles */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="flex flex-col justify-between border-border lg:border-l lg:pl-8"
        >
          <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
            {t('executionsToday')}
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            {loadingToday ? (
              <Loader2 size={18} className="animate-spin text-text-tertiary" />
            ) : (
              <>
                <p className="font-geist-mono text-4xl font-light tracking-tight text-text-primary">
                  {(statsToday?.total ?? 0).toLocaleString()}
                </p>
                {(statsToday?.successful ?? 0) > 0 && (
                  <span className="text-xs font-medium text-success">
                    {statsToday?.successful} {t('successful')}
                  </span>
                )}
              </>
            )}
          </div>
        </motion.div>

        {/* Créditos — billing:read only */}
        <PermissionGuard permissions="billing:read">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col justify-between border-border lg:border-l lg:pl-8"
          >
            <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
              {t('availableCredits')}
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              {loadingBilling ? (
                <Loader2 size={18} className="animate-spin text-text-tertiary" />
              ) : (
                <>
                  <p className="font-geist-mono text-4xl font-light tracking-tight text-text-primary">
                    {creditData.available.toLocaleString()}
                  </p>
                  <span className="text-xs font-medium text-text-tertiary">
                    {creditData.used.toLocaleString()} {t('usedThisMonth')}
                  </span>
                </>
              )}
            </div>
          </motion.div>
        </PermissionGuard>

        {/* Miembros — users:read only */}
        <PermissionGuard permissions="users:read">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="flex flex-col justify-between border-border lg:border-l lg:pl-8"
          >
            <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
              {t('teamMembers')}
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              {loadingUsers ? (
                <Loader2 size={18} className="animate-spin text-text-tertiary" />
              ) : (
                <>
                  <p className="font-geist-mono text-4xl font-light tracking-tight text-text-primary">
                    {userStats?.total ?? 0}
                  </p>
                  <span className="text-xs font-medium text-text-tertiary">
                    {userStats?.active ?? 0} {t('activeCount')}
                  </span>
                </>
              )}
            </div>
          </motion.div>
        </PermissionGuard>
      </div>

      {/* ── Charts Row ─────────────────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-1">
        {/* Area chart — executions 7 days */}
        <div className="rounded-2xl border border-border bg-surface">
          <SectionTitle>
            {t('executions7Days')}
          </SectionTitle>
          <div className="p-5">
            {loading7d ? (
              <ChartSkeleton height={220} />
            ) : areaData.every((d) => d.Ejecuciones === 0) ? (
              <div className="flex flex-col items-center justify-center py-12 text-text-tertiary">
                <div className="flex h-16 w-16 items-center justify-center rounded-full">
                  <Activity size={32} />
                </div>
                <p className="mt-4 text-sm font-medium text-text-tertiary">
                  {t('noExecutions7Days')}
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220} minWidth={0}>
                <AreaChart data={areaData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="execGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--chart-execution)" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="var(--chart-execution)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.05} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(dateStr) => {
                      const d = new Date(dateStr + 'T00:00:00');
                      const name = d.toLocaleDateString('es-MX', { weekday: 'short' });
                      return name.charAt(0).toUpperCase() + name.slice(1);
                    }}
                    tick={{ fontSize: 12, fill: 'currentColor', opacity: 0.4 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: 'currentColor', opacity: 0.4 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="Ejecuciones"
                    stroke="var(--chart-execution)"
                    strokeWidth={2}
                    fill="url(#execGrad)"
                    dot={false}
                    activeDot={{ r: 5, fill: 'var(--chart-execution)' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ── Bar Chart + Activity Feed ───────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Horizontal bar — workflows breakdown */}
        <div className="rounded-2xl border border-border bg-surface">
          <SectionTitle href="/workflows" linkLabel={t('viewWorkflows')}>
            {t('workflowStatus')}
          </SectionTitle>
          <div className="p-5">
            {loadingWf ? (
              <ChartSkeleton height={220} />
            ) : (
              <div className="flex w-full min-w-0 items-center justify-center">
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220} minWidth={0}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} strokeWidth={0} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                      <Legend
                        verticalAlign="middle"
                        align="right"
                        layout="vertical"
                        iconType="circle"
                        formatter={(value, entry: any) => (
                          <span className="text-sm font-medium text-text-primary">
                            {value}{' '}
                            <span className="text-text-tertiary">
                              ({entry.payload.value})
                            </span>
                          </span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-[220px] w-full flex-col items-center justify-center gap-3 text-text-tertiary">
                    <div className="relative flex h-32 w-32 items-center justify-center rounded-full border-[16px] border-current opacity-20"></div>
                    <p className="text-sm font-medium">{t('noWorkflows')}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Top Workflows (executions:read) */}
        <PermissionGuard permissions="executions:read">
          <div className="rounded-2xl border border-border bg-surface">
            <SectionTitle>
              {t('topWorkflows7Days')}
            </SectionTitle>
            <div className="divide-y divide-border">
              {loading7d ? (
                <div className="p-5">
                  <ChartSkeleton height={160} />
                </div>
              ) : (stats7d?.topWorkflows ?? []).length > 0 ? (
                stats7d!.topWorkflows.slice(0, 5).map((wf, i) => {
                  const successPct = Math.round(wf.successRate ?? 0);
                  const barColor =
                    successPct >= 90
                      ? 'bg-success-500'
                      : successPct >= 70
                        ? 'bg-warning-400'
                        : 'bg-danger-500';
                  return (
                    <div key={wf.workflowId} className="flex items-center gap-4 px-5 py-4">
                      {/* Rank */}
                      <span className="w-6 flex-shrink-0 text-center text-lg leading-none">
                        <span className="text-sm font-light text-text-tertiary">
                          {i + 1}
                        </span>
                      </span>

                      {/* Name + bar */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-text-primary">
                          {wf.workflowName}
                        </p>
                        {/* Success rate bar */}
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className="text-xs text-text-tertiary">
                            {t('successRate')}
                          </span>
                          <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-secondary">
                            <div
                              className={`h-full rounded-full ${barColor} transition-all duration-500`}
                              style={{ width: `${successPct}%` }}
                            />
                          </div>
                          <span className="flex-shrink-0 text-xs text-text-tertiary">
                            {successPct}%
                          </span>
                        </div>
                      </div>

                      {/* Execution count */}
                      <div className="flex-shrink-0 text-right">
                        <p className="font-geist-mono text-sm font-light text-text-primary">
                          {wf.executions.toLocaleString()}
                        </p>
                        <p className="text-xs text-text-tertiary">{t('executions')}</p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-text-tertiary">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full">
                    <Activity size={32} />
                  </div>
                  <p className="mt-4 text-sm font-medium text-text-tertiary">
                    {t('noDataCurrentPeriod')}
                  </p>
                </div>
              )}
            </div>
          </div>
        </PermissionGuard>
      </div>

      {/* ── Recent Executions Table ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-surface">
        <SectionTitle>
          {t('recentExecutions')}
        </SectionTitle>
        {loadingExecs ? (
          <div className="p-5">
            <ChartSkeleton height={140} />
          </div>
        ) : executions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-text-tertiary">
            <div className="flex h-16 w-16 items-center justify-center rounded-full">
              <Activity size={32} />
            </div>
            <p className="mt-4 text-sm font-medium text-text-tertiary">
              {t('noRecentExecutions')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-text-tertiary">
                    {t('colWorkflow')}
                  </th>
                  <th className="px-5 py-3 text-left font-medium text-text-tertiary">
                    {t('colStatus')}
                  </th>
                  <th className="px-5 py-3 text-left font-medium text-text-tertiary">
                    {t('colCredits')}
                  </th>
                  <th className="px-5 py-3 text-left font-medium text-text-tertiary">
                    {t('colDate')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {executions.slice(0, 5).map((exec: any, i: number) => {
                  const wfName = exec.workflow?.name ?? exec.workflowName ?? exec.workflowId ?? '—';
                  const credits = exec.credits ?? exec.creditsUsed ?? exec.tokensUsed ?? '—';
                  const dateVal = exec.startedAt ?? exec.createdAt;
                  const date = dateVal
                    ? new Date(dateVal).toLocaleString('es-MX', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '—';
                  return (
                    <tr
                      key={exec.id ?? i}
                      className="transition-colors hover:bg-surface-secondary"
                    >
                      <td className="max-w-[200px] truncate px-5 py-3.5 font-medium text-text-primary">
                        {wfName}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                            exec.status === 'COMPLETED'
                              ? 'text-badge-success-text'
                              : exec.status === 'FAILED'
                                ? 'text-badge-danger-text'
                                : 'text-badge-warning-text'
                          }`}
                        >
                          <span className="h-2 w-2 rounded-full bg-current" />
                          {statusLabel(exec.status)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-text-secondary">
                        {typeof credits === 'number' ? credits.toLocaleString() : credits}
                      </td>
                      <td className="px-5 py-3.5 text-text-secondary">{date}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
