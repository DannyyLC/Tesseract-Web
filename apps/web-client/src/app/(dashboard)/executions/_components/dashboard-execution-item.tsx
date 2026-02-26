import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Loader2, AlertCircle, Zap, Clock, Coins } from 'lucide-react';
import { DashboardExecutionDataDto } from '@tesseract/types';
import { useExecution } from '@/hooks/useExecutions';

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
    case 'completed':
    case 'success':
      return {
        label: 'Completada',
        color: 'text-emerald-500',
        statusColor: 'bg-emerald-500',
        bgColor: 'bg-emerald-500/10',
      };
    case 'failed':
      return {
        label: 'Fallida',
        color: 'text-red-500',
        statusColor: 'bg-red-500',
        bgColor: 'bg-red-500/10',
      };
    case 'running':
      return {
        label: 'Ejecutando',
        color: 'text-blue-500',
        statusColor: 'bg-blue-500',
        bgColor: 'bg-blue-500/10',
      };
    case 'cancelled':
      return {
        label: 'Cancelada',
        color: 'text-gray-500',
        statusColor: 'bg-gray-500',
        bgColor: 'bg-gray-500/10',
      };
    case 'pending':
      return {
        label: 'Pendiente',
        color: 'text-slate-500',
        statusColor: 'bg-slate-500',
        bgColor: 'bg-slate-500/10',
      };
    case 'timeout':
      return {
        label: 'Timeout',
        color: 'text-orange-500',
        statusColor: 'bg-orange-500',
        bgColor: 'bg-orange-500/10',
      };
    default:
      return {
        label: status,
        color: 'text-amber-500',
        statusColor: 'bg-amber-500',
        bgColor: 'bg-amber-500/10',
      };
  }
};

const getTriggerLabel = (trigger: string): string => {
  const labels: Record<string, string> = {
    whatsapp: 'WhatsApp',
    webhook: 'Webhook',
    schedule: 'Programado',
    email: 'Email',
    api: 'API',
    manual: 'Panel Web',
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
          ? 'border-black/20 bg-white shadow-md dark:border-white/20 dark:bg-[#141414]'
          : 'border-transparent bg-transparent hover:border-black/5 hover:bg-white hover:shadow-sm dark:hover:border-white/5 dark:hover:bg-[#141414]'
      }`}
    >
      {/* Main Row */}
      <div className="cursor-pointer p-4" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center gap-4">
          {/* Status Indicator - Minimalist Dot */}
          <div className="flex w-8 items-center justify-center">
            <div
              className={`h-2.5 w-2.5 rounded-full ${statusConfig.statusColor || statusConfig.color.replace('text-', 'bg-')} ${execution.status === 'running' ? 'animate-pulse' : ''}`}
            />
          </div>

          {/* Content */}
          <div className="grid min-w-0 flex-1 grid-cols-1 items-center gap-4 md:grid-cols-12">
            {/* Name & User */}
            <div className="flex flex-col justify-center md:col-span-4">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium text-black dark:text-white">
                  {workflowName}
                </p>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="truncate text-xs text-black/40 dark:text-white/40">
                  by {userName}
                </span>
              </div>
            </div>

            {/* Status Badge & Time */}
            <div className="flex flex-col justify-center md:col-span-3">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium ${statusConfig.color}`}>
                  {statusConfig.label}
                </span>
              </div>
              <span className="mt-0.5 text-xs text-black/40 dark:text-white/40">
                {formatTimeAgo(execution.startedAt)}
              </span>
            </div>

            {/* Metrics (Hidden on Mobile) */}
            <div className="hidden items-center justify-end gap-6 md:col-span-4 md:flex">
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-medium uppercase tracking-wider text-black/30 dark:text-white/30">
                  Duration
                </span>
                <span className="font-mono text-sm text-black/70 dark:text-white/70">
                  {execution.duration !== null ? `${execution.duration}s` : '-'}
                </span>
              </div>
              <div className="flex min-w-[60px] flex-col items-end">
                <span className="text-[10px] font-medium uppercase tracking-wider text-black/30 dark:text-white/30">
                  Credits
                </span>
                <span className="font-mono text-sm text-black/70 dark:text-white/70">
                  {execution.credits !== null ? execution.credits : '-'}
                </span>
              </div>
              <div className="flex min-w-[60px] flex-col items-end">
                <span className="text-[10px] font-medium uppercase tracking-wider text-black/30 dark:text-white/30">
                  Trigger
                </span>
                <span className="text-xs text-black/70 dark:text-white/70">
                  {getTriggerLabel(execution.trigger)}
                </span>
              </div>
            </div>

            {/* Chevron */}
            <div className="flex justify-end md:col-span-1">
              <ChevronDown
                size={16}
                className={`text-black/20 transition-transform duration-200 dark:text-white/20 ${isExpanded ? 'rotate-180' : 'group-hover:text-black/40 dark:group-hover:text-white/40'}`}
              />
            </div>
          </div>
        </div>
        {/* Error Preview inline */}
        {execution.status === 'failed' && !isExpanded && (
          <div className="ml-12 mt-2 pl-1">
            <p className="w-fit max-w-full truncate rounded bg-red-500/5 px-2 py-1 font-mono text-xs text-red-500/80">
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
              <div className="border-t border-black/5 pt-4 dark:border-white/5">
                {isLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="animate-spin text-black/20 dark:text-white/20" size={20} />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Metrics Grid */}
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                      <div className="rounded-lg border border-black/5 bg-black/[0.02] p-3 dark:border-white/5 dark:bg-white/[0.02]">
                        <div className="mb-1 flex items-center gap-2">
                          <Zap size={12} className="text-black/40 dark:text-white/40" />
                          <span className="text-xs font-medium text-black/50 dark:text-white/50">
                            Credits
                          </span>
                        </div>
                        <p className="font-mono text-sm font-medium text-black dark:text-white">
                          {displayData.credits !== null ? displayData.credits : '0'}
                        </p>
                      </div>

                      <div className="rounded-lg border border-black/5 bg-black/[0.02] p-3 md:col-span-2 dark:border-white/5 dark:bg-white/[0.02]">
                        <div className="mb-1 flex items-center gap-2">
                          <Clock size={12} className="text-black/40 dark:text-white/40" />
                          <span className="text-xs font-medium text-black/50 dark:text-white/50">
                            Timing
                          </span>
                        </div>
                        <div className="flex flex-col gap-x-6 gap-y-1 sm:flex-row">
                          <div className="text-xs text-black/80 dark:text-white/80">
                            <span className="mr-1 text-black/40 dark:text-white/40">Start:</span>
                            <span className="font-mono">
                              {formatDate(displayData.startedAt)}{' '}
                              {formatTime(displayData.startedAt)}
                            </span>
                          </div>
                          {displayData.finishedAt && (
                            <div className="text-xs text-black/80 dark:text-white/80">
                              <span className="mr-1 text-black/40 dark:text-white/40">End:</span>
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
                        <div className="rounded-lg border border-black/5 bg-black/[0.02] p-3 dark:border-white/5 dark:bg-white/[0.02]">
                          <div className="mb-2 flex items-center gap-2">
                            <Coins size={12} className="text-black/40 dark:text-white/40" />
                            <span className="text-xs font-medium text-black/50 dark:text-white/50">
                              Balance
                            </span>
                          </div>
                          <div className="flex flex-col gap-1">
                            {displayData.balanceBefore !== undefined &&
                              displayData.balanceBefore !== null && (
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-black/40 dark:text-white/40">Antes:</span>
                                  <span className="font-mono text-black/70 dark:text-white/70">
                                    {displayData.balanceBefore}
                                  </span>
                                </div>
                              )}
                            {displayData.balanceAfter !== undefined &&
                              displayData.balanceAfter !== null && (
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-black/40 dark:text-white/40">Despues:</span>
                                  <span className="font-mono font-medium text-black dark:text-white">
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
                          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                            <div className="mb-1 flex items-center gap-2">
                              <AlertCircle size={12} className="text-red-600 dark:text-red-400" />
                              <span className="text-xs font-medium text-red-600 dark:text-red-400">
                                Error Details
                              </span>
                            </div>
                            <code className="block break-all font-mono text-xs text-red-600/90 dark:text-red-400/90">
                              {displayData.error}
                            </code>
                          </div>
                        )}

                        {displayData.wasOverage && (
                          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                            <div className="mb-1 flex items-center gap-2">
                              <AlertCircle
                                size={12}
                                className="text-amber-600 dark:text-amber-400"
                              />
                              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                                Limit Exceeded
                              </span>
                            </div>
                            <p className="text-xs text-amber-600/90 dark:text-amber-400/90">
                              This execution exceeded the credit limit.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Footer Info */}
                    <div className="flex items-center justify-between pt-1">
                      {displayData.apiKeyName && (
                        <div className="flex items-center gap-1.5 rounded border border-black/5 bg-black/[0.02] px-2 py-1 dark:border-white/5 dark:bg-white/[0.02]">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-black/40 dark:text-white/40">
                            API Key
                          </span>
                          <span className="font-mono text-xs text-black/70 dark:text-white/70">
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
