'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Search } from 'lucide-react';
import { useDashboardExecutions, useExecutionsStats } from '@/hooks/automation/use-executions';
import { useInfiniteDashboardWorkflows } from '@/hooks/automation/use-workflows';
import { useInfiniteUsersDashboard } from '@/hooks/identity/use-users';
import { LogoLoader } from '@/components/ui/logo-loader';
import DashboardExecutionItem from './_components/dashboard-execution-item';
import FilterDropdown from './_components/filter-dropdown';
import PermissionGuard from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/identity/use-auth';
import { ROLE_PERMISSIONS } from '@tesseract/types';

export default function ExecutionsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Read state from URL
  const cursor = searchParams.get('cursor') || undefined;
  const pageAction = searchParams.get('action') as 'next' | 'prev' | undefined;
  const selectedWorkflow = searchParams.get('workflowId') || undefined;
  const selectedUser = searchParams.get('userId') || undefined;
  const selectedStatus = searchParams.get('status') || undefined;
  const selectedTrigger = searchParams.get('trigger') || undefined;
  const startDateParam = searchParams.get('startDate');
  const endDateParam = searchParams.get('endDate');

  const startDate = startDateParam ? new Date(startDateParam) : undefined;
  const endDate = endDateParam ? new Date(endDateParam) : undefined;

  const pageSize = 10;

  // Helper to update URL
  const updateUrl = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());

    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const { data: user } = useAuth();
  const userPermissions = user ? ROLE_PERMISSIONS[user.role] || [] : [];
  const hasUsersRead = userPermissions.includes('users:read');

  const { data: executionsData, isLoading } = useDashboardExecutions({
    cursor,
    pageSize,
    action: pageAction,
    workflowId: selectedWorkflow,
    userId: selectedUser,
    status: selectedStatus,
    trigger: selectedTrigger,
    startDate,
    endDate,
  });

  // Load Stats
  const { data: stats } = useExecutionsStats('30d');

  // Load Filter Lists
  // Workflows
  const {
    data: workflowsData,
    fetchNextPage: fetchNextWorkflows,
    hasNextPage: hasNextWorkflows,
    isFetchingNextPage: isFetchingNextWorkflows,
  } = useInfiniteDashboardWorkflows(10);

  const workflows = (workflowsData?.pages.flatMap((page) => page.items) ?? []).map((wf) => ({
    label: wf.name,
    value: wf.id,
  }));

  // Users
  const {
    data: usersData,
    fetchNextPage: fetchNextUsers,
    hasNextPage: hasNextUsers,
    isFetchingNextPage: isFetchingNextUsers,
  } = useInfiniteUsersDashboard({ pageSize: 10 });

  const users = (usersData?.pages.flatMap((page) => page.items) ?? []).map((user) => ({
    label: user.name || user.email,
    value: user.id,
  }));

  // Static Filters
  const statusOptions = [
    { label: 'Pendiente', value: 'PENDING' },
    { label: 'Ejecutando', value: 'RUNNING' },
    { label: 'Completada', value: 'COMPLETED' },
    { label: 'Fallida', value: 'FAILED' },
    { label: 'Cancelada', value: 'CANCELLED' },
    { label: 'Timeout', value: 'TIMEOUT' },
  ];

  const triggerOptions = [
    { label: 'Panel Web', value: 'MANUAL' },
    { label: 'API', value: 'API' },
    // { label: 'Programado', value: 'SCHEDULE' },
    // { label: 'Webhook', value: 'WEBHOOK' },
    // { label: 'WhatsApp', value: 'WHATSAPP' },
  ];

  const executions = executionsData?.items ?? [];
  const nextPageAvailable = executionsData?.nextPageAvailable ?? false;
  const nextCursor = executionsData?.nextCursor;
  const prevCursor = executionsData?.prevCursor;

  // Handlers
  const handleNextPage = () => {
    if (nextPageAvailable && nextCursor) {
      updateUrl({ cursor: nextCursor, action: 'next' });
    }
  };

  const handlePrevPage = () => {
    if (prevCursor) {
      updateUrl({ cursor: prevCursor, action: 'prev' });
    }
  };

  const handleWorkflowChange = (workflowId: string) => {
    updateUrl({ workflowId: workflowId || null, cursor: null, action: null });
  };

  const handleUserChange = (userId: string) => {
    updateUrl({ userId: userId || null, cursor: null, action: null });
  };

  const handleStatusChange = (status: string) => {
    updateUrl({ status: status || null, cursor: null, action: null });
  };

  const handleTriggerChange = (trigger: string) => {
    updateUrl({ trigger: trigger || null, cursor: null, action: null });
  };

  const handleDateChange = (key: 'startDate' | 'endDate', value: string) => {
    updateUrl({ [key]: value || null, cursor: null, action: null });
  };

  return (
    <PermissionGuard permissions="executions:read" redirect={true} fallbackRoute="/dashboard">
      <div className="space-y-6">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-medium tracking-tight text-text-primary">
              Registro de Actividad del Mes
            </h1>
            <p className="mt-1 text-sm font-light text-text-tertiary">
              Monitoreo en tiempo real de ejecuciones y rendimiento
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="mb-8 grid grid-cols-2 gap-8 px-2 lg:grid-cols-4">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex flex-col justify-between"
          >
            <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Ejecuciones
            </span>
            <div className="mt-1 flex items-baseline gap-1">
              <p className="font-geist-mono text-4xl font-light tracking-tight text-text-primary">
                {stats?.total ?? 0}
              </p>
              <span className="text-xs font-medium text-text-tertiary">totales</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="flex flex-col justify-between border-[var(--border-subtle)] lg:border-l lg:pl-8"
          >
            <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Tasa de Éxito
            </span>
            <div className="mt-1 flex items-baseline gap-3">
              <p className="font-geist-mono text-4xl font-light tracking-tight text-text-primary">
                {stats?.successful ?? 0}
              </p>
              <span className="px-2 py-0.5 text-xs font-medium text-[var(--success-text-adaptive)]">
                {stats?.successRate?.toFixed(0) ?? 0}%
              </span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col justify-between border-[var(--border-subtle)] lg:border-l lg:pl-8"
          >
            <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Fallidas
            </span>
            <div className="mt-1 flex items-baseline gap-3">
              <p className="font-geist-mono text-4xl font-light tracking-tight text-text-primary">
                {stats?.failed ?? 0}
              </p>
              {stats && stats.failed > 0 && (
                <span className="px-2 py-0.5 text-xs font-medium text-[var(--danger-text-adaptive)]">
                  {((stats.failed / stats.total) * 100).toFixed(0)}%
                </span>
              )}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="flex flex-col justify-between border-[var(--border-subtle)] lg:border-l lg:pl-8"
          >
            <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Duración Prom.
            </span>
            <div className="mt-1 flex items-baseline gap-1">
              <p className="font-geist-mono text-4xl font-light tracking-tight text-text-primary">
                {stats?.avgDuration?.toFixed(2) ?? 0}
              </p>
              <span className="text-xs font-medium text-text-tertiary">segundos</span>
            </div>
          </motion.div>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row">
          {/* Workflows Filter */}
          <div className="flex-1">
            <FilterDropdown
              label="Workflow"
              options={workflows}
              value={selectedWorkflow}
              onChange={handleWorkflowChange}
              placeholder="Todos los Workflows"
              onReachEnd={() => hasNextWorkflows && fetchNextWorkflows()}
              hasMore={hasNextWorkflows}
              isLoadingMore={isFetchingNextWorkflows}
            />
          </div>

          {/* Users Filter - only for users with users:read permission */}
          {hasUsersRead && (
            <div className="flex-1">
              <FilterDropdown
                label="Usuario"
                options={users}
                value={selectedUser}
                onChange={handleUserChange}
                placeholder="Todos los Usuarios"
                onReachEnd={() => hasNextUsers && fetchNextUsers()}
                hasMore={hasNextUsers}
                isLoadingMore={isFetchingNextUsers}
              />
            </div>
          )}
        </div>

        {/* Secondary Filters Row */}
        <div className="flex flex-col gap-3 sm:flex-row">
          {/* Status Filter */}
          <div className="flex-1">
            <FilterDropdown
              label="Estatus"
              options={statusOptions}
              value={selectedStatus}
              onChange={handleStatusChange}
              placeholder="Todos los Estatus"
            />
          </div>

          {/* Trigger Filter */}
          <div className="flex-1">
            <FilterDropdown
              label="Trigger"
              options={triggerOptions}
              value={selectedTrigger}
              onChange={handleTriggerChange}
              placeholder="Todos los Triggers"
            />
          </div>

          {/* Date Filters */}
          <div className="flex flex-1 gap-3">
            <div className="flex-1">
              <div
                onClick={() => {
                  const input = document.getElementById('startDateInput') as HTMLInputElement;
                  input?.showPicker();
                }}
                className="group flex w-full cursor-pointer items-center gap-2 rounded-full bg-[var(--surface-tint)] px-4 py-2 transition-all duration-200 hover:bg-[var(--surface-tint-md)]"
              >
                <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-text-tertiary transition-colors group-hover:text-text-secondary">
                  Desde
                </span>
                <div className="mx-1 h-3 w-[1px] bg-surface-secondary" />
                <input
                  id="startDateInput"
                  type="date"
                  value={startDateParam || ''}
                  onChange={(e) => handleDateChange('startDate', e.target.value)}
                  className="w-full cursor-pointer appearance-none bg-transparent p-0 text-sm font-medium text-text-primary outline-none [color-scheme:var(--date-color-scheme)]"
                />
              </div>
            </div>
            <div className="flex-1">
              <div
                onClick={() => {
                  const input = document.getElementById('endDateInput') as HTMLInputElement;
                  input?.showPicker();
                }}
                className="group flex w-full cursor-pointer items-center gap-2 rounded-full bg-[var(--surface-tint)] px-4 py-2 transition-all duration-200 hover:bg-[var(--surface-tint-md)]"
              >
                <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-text-tertiary transition-colors group-hover:text-text-secondary">
                  Hasta
                </span>
                <div className="mx-1 h-3 w-[1px] bg-surface-secondary" />
                <input
                  id="endDateInput"
                  type="date"
                  value={endDateParam || ''}
                  onChange={(e) => handleDateChange('endDate', e.target.value)}
                  className="w-full cursor-pointer appearance-none bg-transparent p-0 text-sm font-medium text-text-primary outline-none [color-scheme:var(--date-color-scheme)]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Executions List */}
        <div className="relative min-h-[200px] space-y-3">
          {/* Loading Overlay */}
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-start justify-center rounded-2xl bg-[var(--loading-overlay-bg)] pt-10 backdrop-blur-[1px]">
              <LogoLoader />
            </div>
          )}

          <AnimatePresence mode="popLayout">
            {executions.map((execution, index) => {
              return <DashboardExecutionItem key={execution.id} execution={execution} />;
            })}
          </AnimatePresence>

          {/* Empty State */}
          {executions.length === 0 && !isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-16 text-center"
            >
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-secondary">
                <Search size={24} className="text-text-tertiary" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-text-primary">
                No se encontraron ejecuciones
              </h3>
              <p className="text-text-secondary">
                Intenta con otros filtros o criterios de búsqueda
              </p>
            </motion.div>
          )}
        </div>

        {/* Pagination Controls */}
        <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-4">
          <button
            onClick={handlePrevPage}
            disabled={!prevCursor}
            className="px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary disabled:opacity-30 disabled:hover:text-text-secondary"
          >
            Anterior
          </button>
          <span className="text-xs text-text-tertiary">
            Showing {executions.length} items
          </span>
          <button
            onClick={handleNextPage}
            disabled={!nextPageAvailable}
            className="px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary disabled:opacity-30 disabled:hover:text-text-secondary"
          >
            Siguiente
          </button>
        </div>
      </div>
    </PermissionGuard>
  );
}
