import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Loader2, AlertCircle, Zap, Clock, Coins } from 'lucide-react';
import { DashboardExecutionDataDto } from '@tesseract/types';
import { useExecution } from '@/hooks/automation/use-executions';

interface DashboardExecutionItemProps {
  execution: DashboardExecutionDataDto;
}

const formatDate = (dateString: string | Date | undefined): string => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
};

const formatTime = (dateString: string | Date | undefined): string => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const formatTimeAgo = (dateString: string | Date | undefined): string => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMins < 1) return 'Ahora';
  if (diffMins < 60) return `Hace ${diffMins} min`;
  if (diffHours < 24) return `Hace ${diffHours}h`;
  return formatDate(dateString);
};

const getStatusConfig = (status: string) => {
  switch (status) {
    case 'COMPLETED':
      return {
        label: 'Completada',
        color: 'text-success-500',
        statusColor: 'bg-success-500',
        bgColor: 'bg-success-500/10',
      };
    case 'FAILED':
      return {
        label: 'Fallida',
        color: 'text-danger',
        statusColor: 'bg-danger',
        bgColor: 'bg-danger/10',
      };
    case 'RUNNING':
      return {
        label: 'Ejecutando',
        color: 'text-info',
        statusColor: 'bg-info',
        bgColor: 'bg-info/10',
      };
    case 'CANCELLED':
      return {
        label: 'Cancelada',
        color: 'text-neutral-500',
        statusColor: 'bg-neutral-500',
        bgColor: 'bg-neutral-500/10',
      };
    case 'PENDING':
      return {
        label: 'Pendiente',
        color: 'text-neutral-400',
        statusColor: 'bg-neutral-400',
        bgColor: 'bg-neutral-400/10',
      };
    case 'TIMEOUT':
      return {
        label: 'Timeout',
        color: 'text-[var(--chart-timeout)]',
        statusColor: 'bg-[var(--chart-timeout)]',
        bgColor: 'bg-[var(--chart-timeout)]/10',
      };
    default:
      return {
        label: status,
        color: 'text-warning-500',
        statusColor: 'bg-warning-500',
        bgColor: 'bg-warning-500/10',
      };
  }
};

const getTriggerLabel = (trigger: string): string => {
  const labels: Record<string, string> = {
    WHATSAPP: 'WhatsApp',
    WEBHOOK: 'Webhook',
    SCHEDULE: 'Programado',
    EMAIL: 'Email',
    API: 'API',
    MANUAL: 'Panel Web',
  };
  return labels[trigger] || trigger;
};

export default function DashboardExecutionItem({ execution }: DashboardExecutionItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const statusConfig = getStatusConfig(execution.status);
  // const StatusIcon removed as we use dots now

  // Fetch full details only when expanded.
  const { data: fullExecution, isLoading } = useExecution(isExpanded ? execution.id : '');

  // Merge dashboard data with full details when available
  // Cast to any because the provided JSON is slightly generic and DTOs might not fully capture dynamic fields
  // but we will use the specific fields requested.
  const displayData = (fullExecution || execution) as any;

  // Use names from initial execution object since detailed view might not include them
  const workflowName =
    execution.workflow?.name ||
    execution.workflowName ||
    displayData.workflow?.name ||
    displayData.workflowName ||
    'Workflow';
  const userName =
    execution.user?.name ||
    execution.userName ||
    displayData.user?.name ||
    displayData.userName ||
    'Sistema';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className={`group overflow-hidden rounded-xl border transition-all duration-200 ${
        isExpanded
          ? 'border-border-hover bg-surface-elevated shadow-md'
          : 'border-transparent bg-transparent hover:border-border hover:bg-surface-panel hover:shadow-sm'
      }`}
    >
      {/* Main Row */}
      <div className="cursor-pointer p-4" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center gap-4">
          {/* Status Indicator - Minimalist Dot */}
          <div className="flex w-8 items-center justify-center">
            <div
              className={`h-2.5 w-2.5 rounded-full ${statusConfig.statusColor || statusConfig.color.replace('text-', 'bg-')} ${execution.status === 'RUNNING' ? 'animate-pulse' : ''}`}
            />
          </div>

          {/* Content */}
          <div className="grid min-w-0 flex-1 grid-cols-1 items-center gap-4 md:grid-cols-12">
            {/* Name & User */}
            <div className="flex flex-col justify-center md:col-span-4">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium text-text-primary">{workflowName}</p>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="truncate text-xs text-text-tertiary">by {userName}</span>
              </div>
            </div>

            {/* Status Badge & Time */}
            <div className="flex flex-col justify-center md:col-span-3">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium ${statusConfig.color}`}>
                  {statusConfig.label}
                </span>
              </div>
              <span className="mt-0.5 text-xs text-text-tertiary">
                {formatTimeAgo(execution.startedAt)}
              </span>
            </div>

            {/* Metrics (Hidden on Mobile) */}
            <div className="hidden items-center justify-end gap-6 md:col-span-4 md:flex">
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-medium uppercase tracking-wider text-text-tertiary">
                  Duration
                </span>
                <span className="font-mono text-sm text-text-primary">
                  {execution.duration !== null ? `${execution.duration}s` : '-'}
                </span>
              </div>
              <div className="flex min-w-[60px] flex-col items-end">
                <span className="text-[10px] font-medium uppercase tracking-wider text-text-tertiary">
                  Credits
                </span>
                <span className="font-mono text-sm text-text-primary">
                  {execution.credits !== null ? execution.credits : '-'}
                </span>
              </div>
              <div className="flex min-w-[60px] flex-col items-end">
                <span className="text-[10px] font-medium uppercase tracking-wider text-text-tertiary">
                  Trigger
                </span>
                <span className="text-xs text-text-primary">
                  {getTriggerLabel(execution.trigger)}
                </span>
              </div>
            </div>

            {/* Chevron */}
            <div className="flex justify-end md:col-span-1">
              <ChevronDown
                size={16}
                className={`text-text-tertiary transition-transform duration-200 ${isExpanded ? 'rotate-180' : 'group-hover:text-text-secondary'}`}
              />
            </div>
          </div>
        </div>
        {/* Error Preview inline */}
        {execution.status === 'FAILED' && !isExpanded && (
          <div className="ml-12 mt-2 pl-1">
            <p className="bg-danger/5 text-danger/80 w-fit max-w-full truncate rounded px-2 py-1 font-mono text-xs">
              Error en la ejecución.
            </p>
          </div>
        )}
      </div>

      {/* Expanded Details */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-0 md:pl-16">
              <div className="border-t border-[var(--border-subtle)] pt-4">
                {isLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="animate-spin text-text-tertiary" size={20} />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Metrics Grid */}
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-3">
                        <div className="mb-1 flex items-center gap-2">
                          <Zap size={12} className="text-text-tertiary" />
                          <span className="text-xs font-medium text-text-secondary">Credits</span>
                        </div>
                        <p className="font-mono text-sm font-medium text-text-primary">
                          {displayData.credits !== null ? displayData.credits : '0'}
                        </p>
                      </div>

                      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-3 md:col-span-2">
                        <div className="mb-1 flex items-center gap-2">
                          <Clock size={12} className="text-text-tertiary" />
                          <span className="text-xs font-medium text-text-secondary">Timing</span>
                        </div>
                        <div className="flex flex-col gap-x-6 gap-y-1 sm:flex-row">
                          <div className="text-xs text-text-primary">
                            <span className="mr-1 text-text-tertiary">Start:</span>
                            <span className="font-mono">
                              {formatDate(displayData.startedAt)}{' '}
                              {formatTime(displayData.startedAt)}
                            </span>
                          </div>
                          {displayData.finishedAt && (
                            <div className="text-xs text-text-primary">
                              <span className="mr-1 text-text-tertiary">End:</span>
                              <span className="font-mono">
                                {formatDate(displayData.finishedAt)}{' '}
                                {formatTime(displayData.finishedAt)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {(displayData.balanceBefore !== undefined ||
                        displayData.balanceAfter !== undefined) && (
                        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-3">
                          <div className="mb-2 flex items-center gap-2">
                            <Coins size={12} className="text-text-tertiary" />
                            <span className="text-xs font-medium text-text-secondary">Balance</span>
                          </div>
                          <div className="flex flex-col gap-1">
                            {displayData.balanceBefore !== undefined &&
                              displayData.balanceBefore !== null && (
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-text-tertiary">Antes:</span>
                                  <span className="font-mono text-text-primary">
                                    {displayData.balanceBefore}
                                  </span>
                                </div>
                              )}
                            {displayData.balanceAfter !== undefined &&
                              displayData.balanceAfter !== null && (
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-text-tertiary">Despues:</span>
                                  <span className="font-mono font-medium text-text-primary">
                                    {displayData.balanceAfter}
                                  </span>
                                </div>
                              )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Error / Warning Section */}
                    {(displayData.error || displayData.wasOverage) && (
                      <div className="space-y-2">
                        {displayData.error && (
                          <div className="border-danger-500/20 bg-danger/5 rounded-lg border p-3">
                            <div className="mb-1 flex items-center gap-2">
                              <AlertCircle
                                size={12}
                                className="text-[var(--danger-text-adaptive)]"
                              />
                              <span className="text-xs font-medium text-[var(--danger-text-adaptive)]">
                                Error Details
                              </span>
                            </div>
                            <code className="block break-all font-mono text-xs text-[var(--danger-text-adaptive)]">
                              {displayData.error}
                            </code>
                          </div>
                        )}

                        {displayData.wasOverage && (
                          <div className="border-warning-500/20 bg-warning-500/5 rounded-lg border p-3">
                            <div className="mb-1 flex items-center gap-2">
                              <AlertCircle
                                size={12}
                                className="text-[var(--warning-text-adaptive)]"
                              />
                              <span className="text-xs font-medium text-[var(--warning-text-adaptive)]">
                                Limit Exceeded
                              </span>
                            </div>
                            <p className="text-xs text-[var(--warning-text-adaptive)]">
                              This execution exceeded the credit limit.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Footer Info */}
                    <div className="flex items-center justify-between pt-1">
                      {displayData.apiKeyName && (
                        <div className="flex items-center gap-1.5 rounded border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-2 py-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
                            API Key
                          </span>
                          <span className="font-mono text-xs text-text-primary">
                            {displayData.apiKeyName}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
