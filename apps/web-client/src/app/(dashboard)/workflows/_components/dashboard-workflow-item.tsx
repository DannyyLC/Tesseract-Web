'use client';

import { motion } from 'framer-motion';
import { MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DashboardWorkflowDto } from '@tesseract/types';

interface DashboardWorkflowItemProps {
  workflow: DashboardWorkflowDto;
}

// Utilidades (Duplicadas por ahora, idealmente en un utils/format.ts)
const formatTimeAgo = (dateString: string | null): string => {
  if (!dateString) return 'Nunca';
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Hace un momento';
    if (diffMins < 60) return `Hace ${diffMins} min`;
    if (diffHours < 24) return `Hace ${diffHours}h`;
    return `Hace ${diffDays}d`;
  } catch (e) {
    return 'Fecha inválida';
  }
};

const getStatusConfig = (isActive: boolean) => {
  if (!isActive) return { label: 'Inactivo', color: 'bg-zinc-400', textColor: 'text-zinc-400' };
  return { label: 'Activo', color: 'bg-emerald-500', textColor: 'text-emerald-500' };
};

export default function DashboardWorkflowItem({ workflow }: DashboardWorkflowItemProps) {
  const statusConfig = getStatusConfig(workflow.isActive);

  const router = useRouter();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      onClick={() => router.push(`/workflows/${workflow.id}`)}
      className="group relative cursor-pointer overflow-hidden rounded-xl border border-transparent bg-transparent transition-all duration-200 hover:border-black/5 hover:bg-white hover:shadow-sm dark:hover:border-white/5 dark:hover:bg-[#141414]"
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-3">
              <h3 className="truncate text-lg font-semibold text-black transition-colors dark:text-white">
                {workflow.name}
              </h3>
              {/* Minimal Status Dot */}
              <div className="flex items-center gap-1.5 px-2 py-0.5">
                <div
                  className={`h-1.5 w-1.5 rounded-full ${statusConfig.color.replace('text-', 'bg-')}`}
                />
                <span
                  className={`text-[10px] font-medium uppercase tracking-wide ${statusConfig.textColor}`}
                >
                  {statusConfig.label}
                </span>
              </div>
            </div>
            <p className="line-clamp-2 text-sm text-black/50 dark:text-white/50">
              {workflow.description || 'Sin descripción'}
            </p>
          </div>

          {/* Chat Action - Always visible but subtle */}
          <div className="flex items-center gap-2">
            <span className="mr-2 hidden text-xs font-medium text-black/40 transition-all group-hover:inline-block dark:text-white/40">
              Ver detalles
            </span>
            <Link
              href={`/conversations/new?workflowId=${workflow.id}`}
              onClick={(e) => e.stopPropagation()}
              className="rounded-full p-2 text-black/40 transition-colors hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white"
              title="Iniciar Chat"
            >
              <MessageSquare size={18} />
            </Link>
          </div>
        </div>

        {/* Quick Info (Lightweight) */}
        <div className="mt-4 flex items-center justify-between border-t border-black/5 pt-4 dark:border-white/5">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-xs font-medium text-black/40 dark:text-white/40">
              {workflow.category || 'STANDARD'}
            </span>
          </div>

          {workflow.lastExecutedAt && (
            <div className="flex items-center gap-2 text-sm text-black/40 dark:text-white/40">
              <span className="text-xs">Ejecutado {formatTimeAgo(workflow.lastExecutedAt)}</span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
