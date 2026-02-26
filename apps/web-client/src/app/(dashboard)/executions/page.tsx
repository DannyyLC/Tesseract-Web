'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
  Search,
} from 'lucide-react';
import { useDashboardExecutions, useExecutionsStats } from '@/hooks/useExecutions';
import { useInfiniteDashboardWorkflows } from '@/hooks/useWorkflows';
import { useInfiniteUsersDashboard } from '@/hooks/useUsers';
import { LogoLoader } from '@/components/ui/logo-loader';
import DashboardExecutionItem from './_components/dashboard-execution-item';
import FilterDropdown from './_components/filter-dropdown';

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
    { label: 'Pendiente', value: 'pending' },
    { label: 'Ejecutando', value: 'running' },
    { label: 'Completada', value: 'completed' },
    { label: 'Fallida', value: 'failed' },
    { label: 'Cancelada', value: 'cancelled' },
    { label: 'Timeout', value: 'timeout' },
  ];

  const triggerOptions = [
    { label: 'Panel Web', value: 'manual' },
    { label: 'API', value: 'api' },
    // { label: 'Programado', value: 'schedule' },
    // { label: 'Webhook', value: 'webhook' },
    // { label: 'WhatsApp', value: 'whatsapp' },
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
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-medium tracking-tight text-black dark:text-white">
            Registro de Actividad del Mes
          </h1>
          <p className="mt-1 text-sm font-light text-black/40 dark:text-white/40">
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
          <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-black/50 dark:text-white/50">
            Ejecuciones
          </span>
          <div className="mt-1 flex items-baseline gap-1">
            <p className="font-geist-mono text-4xl font-light tracking-tight text-black dark:text-white">
              {stats?.total ?? 0}
            </p>
            <span className="text-xs font-medium text-black/30 dark:text-white/30">totales</span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="flex flex-col justify-between border-black/5 lg:border-l lg:pl-8 dark:border-white/5"
        >
          <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-black/50 dark:text-white/50">
            Tasa de Éxito
          </span>
          <div className="mt-1 flex items-baseline gap-3">
            <p className="font-geist-mono text-4xl font-light tracking-tight text-black dark:text-white">
              {stats?.successful ?? 0}
            </p>
            <span className="px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-500">
              {stats?.successRate?.toFixed(0) ?? 0}%
            </span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col justify-between border-black/5 lg:border-l lg:pl-8 dark:border-white/5"
        >
          <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-black/50 dark:text-white/50">
            Fallidas
          </span>
          <div className="mt-1 flex items-baseline gap-3">
            <p className="font-geist-mono text-4xl font-light tracking-tight text-black dark:text-white">
              {stats?.failed ?? 0}
            </p>
            {stats && stats.failed > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-500">
                {((stats.failed / stats.total) * 100).toFixed(0)}%
              </span>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="flex flex-col justify-between border-black/5 lg:border-l lg:pl-8 dark:border-white/5"
        >
          <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-black/50 dark:text-white/50">
            Duración Prom.
          </span>
          <div className="mt-1 flex items-baseline gap-1">
            <p className="font-geist-mono text-4xl font-light tracking-tight text-black dark:text-white">
              {stats?.avgDuration?.toFixed(2) ?? 0}
            </p>
            <span className="text-xs font-medium text-black/30 dark:text-white/30">segundos</span>
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

        {/* Users Filter */}
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
              className="group flex w-full cursor-pointer items-center gap-2 rounded-full bg-black/5 px-4 py-2 transition-all duration-200 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10"
            >
              <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-black/40 transition-colors group-hover:text-black/60 dark:text-white/40 dark:group-hover:text-white/60">
                Desde
              </span>
              <div className="mx-1 h-3 w-[1px] bg-black/10 dark:bg-white/10" />
              <input
                id="startDateInput"
                type="date"
                value={startDateParam || ''}
                onChange={(e) => handleDateChange('startDate', e.target.value)}
                className="w-full cursor-pointer appearance-none bg-transparent p-0 text-sm font-medium text-black outline-none dark:text-white dark:[color-scheme:dark]"
              />
            </div>
          </div>
          <div className="flex-1">
            <div
              onClick={() => {
                const input = document.getElementById('endDateInput') as HTMLInputElement;
                input?.showPicker();
              }}
              className="group flex w-full cursor-pointer items-center gap-2 rounded-full bg-black/5 px-4 py-2 transition-all duration-200 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10"
            >
              <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-black/40 transition-colors group-hover:text-black/60 dark:text-white/40 dark:group-hover:text-white/60">
                Hasta
              </span>
              <div className="mx-1 h-3 w-[1px] bg-black/10 dark:bg-white/10" />
              <input
                id="endDateInput"
                type="date"
                value={endDateParam || ''}
                onChange={(e) => handleDateChange('endDate', e.target.value)}
                className="w-full cursor-pointer appearance-none bg-transparent p-0 text-sm font-medium text-black outline-none dark:text-white dark:[color-scheme:dark]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Executions List */}
      <div className="relative min-h-[200px] space-y-3">
        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-start justify-center rounded-2xl bg-white/50 pt-10 backdrop-blur-[1px] dark:bg-black/50">
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
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-black/5 dark:bg-white/5">
              <Search size={24} className="text-black/30 dark:text-white/30" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-black dark:text-white">
              No se encontraron ejecuciones
            </h3>
            <p className="text-black/50 dark:text-white/50">
              Intenta con otros filtros o criterios de búsqueda
            </p>
          </motion.div>
        )}
      </div>

      {/* Pagination Controls */}
      <div className="flex items-center justify-between border-t border-black/5 pt-4 dark:border-white/5">
        <button
          onClick={handlePrevPage}
          disabled={!prevCursor}
          className="px-4 py-2 text-sm font-medium text-black/60 transition-colors hover:text-black disabled:opacity-30 disabled:hover:text-black/60 dark:text-white/60 dark:hover:text-white dark:disabled:hover:text-white/60"
        >
          Anterior
        </button>
        <span className="text-xs text-black/30 dark:text-white/30">
          Showing {executions.length} items
        </span>
        <button
          onClick={handleNextPage}
          disabled={!nextPageAvailable}
          className="px-4 py-2 text-sm font-medium text-black/60 transition-colors hover:text-black disabled:opacity-30 disabled:hover:text-black/60 dark:text-white/60 dark:hover:text-white dark:disabled:hover:text-white/60"
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}
