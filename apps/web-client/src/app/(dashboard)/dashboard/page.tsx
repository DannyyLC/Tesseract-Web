'use client';

import { useMemo } from 'react';
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
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useWorkflowStats } from '@/hooks/useWorkflows';
import { useExecutionsStats, useDashboardExecutions } from '@/hooks/useExecutions';
import { useBillingDashboard } from '@/hooks/useBilling';
import { useUserStats } from '@/hooks/useUsers';
import PermissionGuard from '@/components/auth/PermissionGuard';
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
    <div className="flex items-center justify-between border-b border-black/5 p-5 dark:border-white/5">
      <h2 className="text-lg font-semibold text-black dark:text-white">{children}</h2>
      {href && (
        <Link
          href={href}
          className="flex items-center gap-1 text-sm text-black/50 transition-colors hover:text-black dark:text-white/50 dark:hover:text-white"
        >
          {linkLabel ?? 'Ver todos'}
          <ArrowUpRight size={14} />
        </Link>
      )}
    </div>
  );
}

// Custom tooltip for recharts with dark mode awareness
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-black/10 bg-white px-3 py-2 shadow-lg dark:border-white/10 dark:bg-[#111]">
      {label && <p className="mb-1 text-xs text-black/50 dark:text-white/40">{label}</p>}
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
      className="w-full animate-pulse rounded-xl bg-black/5 dark:bg-white/5"
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
  const { data: user } = useAuth();
  const userPermissions = user ? ROLE_PERMISSIONS[user.role] || [] : [];
  
  const hasBilling = userPermissions.includes('billing:read');
  const hasUsers = userPermissions.includes('users:read');
  const hasTopStats = hasBilling || hasUsers;

  // Data hooks
  const { data: workflowStats, isLoading: loadingWf } = useWorkflowStats();
  const { data: statsToday, isLoading: loadingToday } = useExecutionsStats('24h');
  const { data: stats7d, isLoading: loading7d } = useExecutionsStats('7d');
  const { data: billingData, isLoading: loadingBilling } = useBillingDashboard();
  const { data: userStats, isLoading: loadingUsers } = useUserStats();
  const { data: recentExecs, isLoading: loadingExecs } = useDashboardExecutions({ pageSize: 5 });

  // ── Area chart data — executions last 7 days ────────────────────────────────
  const areaData = useMemo(() => {
    // If backend provides dailyStats, use them
    if (stats7d?.dailyStats && stats7d.dailyStats.length > 0) {
      // Map to chart format { day: 'Lun', Ejecuciones: 10 }
      // Assuming dailyStats comes sorted or we just map by date
      return stats7d.dailyStats.map((stat) => {
        const date = new Date(stat.date + 'T00:00:00'); // appended time to ensure local day match if string is YYYY-MM-DD
        const dayName = date.toLocaleDateString('es-MX', { weekday: 'short' });
        // Capitalize first letter: 'lun' -> 'Lun'
        const day = dayName.charAt(0).toUpperCase() + dayName.slice(1);
        return {
          day,
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
      { name: 'Activos', value: active, fill: '#22c55e' }, // emerald-500
      { name: 'Pausados', value: paused, fill: '#f59e0b' }, // amber-500
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
    if (s === 'completed' || s === 'success') return 'Completada';
    if (s === 'failed' || s === 'error') return 'Fallida';
    if (s === 'running') return 'En proceso';
    return s;
  }

  return (
    <div className="space-y-6 pb-16">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-black md:text-3xl dark:text-white">
              {user?.name ? `Bienvenido, ${user.name.split(' ')[0]}` : 'Dashboard'}
            </h1>
          </div>
          <p className="mt-1 text-sm text-black/50 dark:text-white/50">
            {user?.organizationName ?? 'Tu organización'} · Resumen de actividad
          </p>
        </div>
      </div>

      {/* ── Stats ──────────────────────────────────────────────────────────── */}
      <div className={`mb-8 grid grid-cols-2 gap-8 px-2 ${hasTopStats ? 'lg:grid-cols-4' : 'lg:grid-cols-2'}`}>
        {/* Workflows Activos — all roles */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-col justify-between"
        >
          <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-black/50 dark:text-white/50">
            Workflows Activos
          </span>
          <div className="mt-1 flex items-baseline gap-1">
            {loadingWf ? (
              <Loader2 size={18} className="animate-spin text-black/20 dark:text-white/20" />
            ) : (
              <>
                <p className="font-geist-mono text-4xl font-light tracking-tight text-black dark:text-white">
                  {workflowStats?.activeWorkflows ?? 0}
                </p>
                <span className="text-xs font-medium text-black/30 dark:text-white/30">
                  de {workflowStats?.totalWorkflows ?? 0}
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
          className="flex flex-col justify-between border-black/5 lg:border-l lg:pl-8 dark:border-white/5"
        >
          <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-black/50 dark:text-white/50">
            Ejecuciones Hoy
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            {loadingToday ? (
              <Loader2 size={18} className="animate-spin text-black/20 dark:text-white/20" />
            ) : (
              <>
                <p className="font-geist-mono text-4xl font-light tracking-tight text-black dark:text-white">
                  {(statsToday?.total ?? 0).toLocaleString()}
                </p>
                {(statsToday?.successful ?? 0) > 0 && (
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-500">
                    {statsToday?.successful} exitosas
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
            className="flex flex-col justify-between border-black/5 lg:border-l lg:pl-8 dark:border-white/5"
          >
            <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-black/50 dark:text-white/50">
              Créditos Disponibles
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              {loadingBilling ? (
                <Loader2 size={18} className="animate-spin text-black/20 dark:text-white/20" />
              ) : (
                <>
                  <p className="font-geist-mono text-4xl font-light tracking-tight text-black dark:text-white">
                    {creditData.available.toLocaleString()}
                  </p>
                  <span className="text-xs font-medium text-black/30 dark:text-white/30">
                    {creditData.used.toLocaleString()} usados este mes
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
            className="flex flex-col justify-between border-black/5 lg:border-l lg:pl-8 dark:border-white/5"
          >
            <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-black/50 dark:text-white/50">
              Miembros del Equipo
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              {loadingUsers ? (
                <Loader2 size={18} className="animate-spin text-black/20 dark:text-white/20" />
              ) : (
                <>
                  <p className="font-geist-mono text-4xl font-light tracking-tight text-black dark:text-white">
                    {userStats?.total ?? 0}
                  </p>
                  <span className="text-xs font-medium text-black/30 dark:text-white/30">
                    {userStats?.active ?? 0} activos
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
        <div className="rounded-2xl border border-black/5 bg-white dark:border-white/5 dark:bg-[#0A0A0A]">
          <SectionTitle href="/executions" linkLabel="Ver ejecuciones">
            Ejecuciones — Últimos 7 días
          </SectionTitle>
          <div className="p-5">
            {loading7d ? (
              <ChartSkeleton height={220} />
            ) : areaData.every((d) => d.Ejecuciones === 0) ? (
              <div className="flex flex-col items-center justify-center py-12 text-black/20 dark:text-white/20">
                <div className="flex h-16 w-16 items-center justify-center rounded-full">
                  <Activity size={32} />
                </div>
                <p className="mt-4 text-sm font-medium text-black/40 dark:text-white/40">
                  Sin ejecuciones en los últimos 7 días
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={areaData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="execGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.05} />
                  <XAxis
                    dataKey="day"
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
                    stroke="#6366f1"
                    strokeWidth={2}
                    fill="url(#execGrad)"
                    dot={false}
                    activeDot={{ r: 5, fill: '#6366f1' }}
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
        <div className="rounded-2xl border border-black/5 bg-white dark:border-white/5 dark:bg-[#0A0A0A]">
          <SectionTitle href="/workflows" linkLabel="Ver workflows">
            Estado de Workflows
          </SectionTitle>
          <div className="p-5">
            {loadingWf ? (
              <ChartSkeleton height={220} />
            ) : (
              <div className="flex items-center justify-center">
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
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
                          <span className="text-sm font-medium text-black dark:text-white">
                            {value}{' '}
                            <span className="text-black/40 dark:text-white/40">
                              ({entry.payload.value})
                            </span>
                          </span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-[220px] w-full flex-col items-center justify-center gap-3 text-black/20 dark:text-white/20">
                    <div className="relative flex h-32 w-32 items-center justify-center rounded-full border-[16px] border-current opacity-20"></div>
                    <p className="text-sm font-medium">Sin workflows creados</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Top Workflows (executions:read) */}
        <PermissionGuard permissions="executions:read">
          <div className="rounded-2xl border border-black/5 bg-white dark:border-white/5 dark:bg-[#0A0A0A]">
            <SectionTitle href="/executions" linkLabel="Ver ejecuciones">
              Top Workflows (7 días)
            </SectionTitle>
            <div className="divide-y divide-black/5 dark:divide-white/5">
              {loading7d ? (
                <div className="p-5">
                  <ChartSkeleton height={160} />
                </div>
              ) : (stats7d?.topWorkflows ?? []).length > 0 ? (
                stats7d!.topWorkflows.slice(0, 5).map((wf, i) => {
                  const successPct = Math.round(wf.successRate ?? 0);
                  const barColor =
                    successPct >= 90
                      ? 'bg-emerald-500'
                      : successPct >= 70
                        ? 'bg-amber-400'
                        : 'bg-red-400';
                  return (
                    <div key={wf.workflowId} className="flex items-center gap-4 px-5 py-4">
                      {/* Rank */}
                      <span className="w-6 flex-shrink-0 text-center text-lg leading-none">
                        <span className="text-sm font-light text-black/30 dark:text-white/30">
                          {i + 1}
                        </span>
                      </span>

                      {/* Name + bar */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-black dark:text-white">
                          {wf.workflowName}
                        </p>
                        {/* Success rate bar */}
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className="text-xs text-black/40 dark:text-white/40">
                            Tasa de éxito
                          </span>
                          <div className="h-1 flex-1 overflow-hidden rounded-full bg-black/5 dark:bg-white/5">
                            <div
                              className={`h-full rounded-full ${barColor} transition-all duration-500`}
                              style={{ width: `${successPct}%` }}
                            />
                          </div>
                          <span className="flex-shrink-0 text-xs text-black/40 dark:text-white/40">
                            {successPct}%
                          </span>
                        </div>
                      </div>

                      {/* Execution count */}
                      <div className="flex-shrink-0 text-right">
                        <p className="font-geist-mono text-sm font-light text-black dark:text-white">
                          {wf.executions.toLocaleString()}
                        </p>
                        <p className="text-xs text-black/30 dark:text-white/30">ejecuciones</p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-black/20 dark:text-white/20">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full">
                    <Activity size={32} />
                  </div>
                  <p className="mt-4 text-sm font-medium text-black/40 dark:text-white/40">
                    Sin datos del período actual
                  </p>
                </div>
              )}
            </div>
          </div>
        </PermissionGuard>
      </div>

      {/* ── Recent Executions Table ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-black/5 bg-white dark:border-white/5 dark:bg-[#0A0A0A]">
        <SectionTitle href="/executions" linkLabel="Ver todas">
          Últimas Ejecuciones
        </SectionTitle>
        {loadingExecs ? (
          <div className="p-5">
            <ChartSkeleton height={140} />
          </div>
        ) : executions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-black/20 dark:text-white/20">
            <div className="flex h-16 w-16 items-center justify-center rounded-full">
              <Activity size={32} />
            </div>
            <p className="mt-4 text-sm font-medium text-black/40 dark:text-white/40">
              No hay ejecuciones recientes
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/5 dark:border-white/5">
                  <th className="px-5 py-3 text-left font-medium text-black/40 dark:text-white/40">
                    Workflow
                  </th>
                  <th className="px-5 py-3 text-left font-medium text-black/40 dark:text-white/40">
                    Estado
                  </th>
                  <th className="px-5 py-3 text-left font-medium text-black/40 dark:text-white/40">
                    Créditos
                  </th>
                  <th className="px-5 py-3 text-left font-medium text-black/40 dark:text-white/40">
                    Fecha
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/5">
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
                      className="transition-colors hover:bg-black/[0.01] dark:hover:bg-white/[0.01]"
                    >
                      <td className="max-w-[200px] truncate px-5 py-3.5 font-medium text-black dark:text-white">
                        {wfName}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                            exec.status === 'completed' || exec.status === 'success'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : exec.status === 'failed' || exec.status === 'error'
                                ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          {statusLabel(exec.status)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-black/60 dark:text-white/60">
                        {typeof credits === 'number' ? credits.toLocaleString() : credits}
                      </td>
                      <td className="px-5 py-3.5 text-black/50 dark:text-white/50">{date}</td>
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
